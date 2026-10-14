import { toast } from 'react-toastify';
import { deploymentOperation, ensureStudioProject, updateStudioProject } from '~/lib/studio-projects.client';
import { useStore } from '@nanostores/react';
import { deploymentConnections } from '~/lib/stores/deploymentConnections';
import {
  getSavedDeployment,
  readDeploymentResponse,
  saveDeployment,
  waitForDeployment,
  type DeploymentResult,
} from '~/lib/deployment.client';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';
import { path } from '~/utils/path';
import { useState } from 'react';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { chatId } from '~/lib/persistence/useChatHistory';
import { addRayuCodeCredit, formatBuildFailureOutput, readDeployFile } from './deployUtils';

export function useNetlifyDeploy(provider: 'netlify' | 'cloudflare' = 'netlify') {
  const [isDeploying, setIsDeploying] = useState(false);
  const connectionState = useStore(deploymentConnections);
  const currentChatId = useStore(chatId);

  const handleNetlifyDeploy = async (target?: { accountId: string; projectName: string }) => {
    const userId = connectionState.userId;

    if (!userId || connectionState.connections[provider]?.status !== 'connected') {
      toast.error(`Connect ${provider} from the Deploy menu first.`);
      return false;
    }

    if (!currentChatId) {
      toast.error('No active chat found');
      return false;
    }

    try {
      setIsDeploying(true);

      const artifact = workbenchStore.firstArtifact;

      if (!artifact) {
        throw new Error('No active project found');
      }

      // Create a deployment artifact for visual feedback
      const deploymentId = `deploy-artifact`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: provider === 'cloudflare' ? 'Cloudflare Pages Deployment' : 'Netlify Deployment',
        type: 'standalone',
      });

      const deployArtifact = workbenchStore.artifacts.get()[deploymentId];

      // Notify that build is starting
      deployArtifact.runner.handleDeployAction('building', 'running', { source: provider });

      // Set up build action
      const actionId = 'build-' + Date.now();
      const actionData: ActionCallbackData = {
        messageId: `${provider} build`,
        artifactId: artifact.id,
        actionId,
        action: {
          type: 'build' as const,
          content: 'npm run build',
        },
      };

      // Add the action first
      artifact.runner.addAction(actionData);

      // Then run it
      await artifact.runner.runAction(actionData);

      const buildOutput = artifact.runner.buildOutput;

      if (!buildOutput || buildOutput.exitCode !== 0) {
        // Notify that build failed
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: formatBuildFailureOutput(buildOutput?.output),
          source: provider,
        });
        throw new Error('Build failed');
      }

      // Notify that build succeeded and deployment is starting
      deployArtifact.runner.handleDeployAction('deploying', 'running', { source: provider });

      // Get the build files
      const container = await webcontainer;

      // Remove /home/project from buildPath if it exists
      const buildPath = buildOutput.path.replace('/home/project', '');

      console.log('Original buildPath', buildPath);

      // Check if the build path exists
      let finalBuildPath = buildPath;

      // List of common output directories to check if the specified build path doesn't exist
      const commonOutputDirs = [buildPath, '/dist', '/build', '/out', '/output', '/.next', '/public'];

      // Verify the build path exists, or try to find an alternative
      let buildPathExists = false;

      for (const dir of commonOutputDirs) {
        try {
          await container.fs.readdir(dir);
          finalBuildPath = dir;
          buildPathExists = true;
          console.log(`Using build directory: ${finalBuildPath}`);
          break;
        } catch (error) {
          // Directory doesn't exist, try the next one
          console.log(`Directory ${dir} doesn't exist, trying next option. ${error}`);
          continue;
        }
      }

      if (!buildPathExists) {
        throw new Error('Could not find build output directory. Please check your build configuration.');
      }

      const files: Record<string, string> = {};
      const binaryFiles: Record<string, string> = {};

      async function collectFiles(dirPath: string): Promise<void> {
        const entries = await container.fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isFile()) {
            // Remove build path prefix from the path
            const deployPath = fullPath.replace(finalBuildPath, '');
            const file = await readDeployFile(container.fs, fullPath);

            if (file.kind === 'text') {
              files[deployPath] = addRayuCodeCredit(deployPath, file.content);
            } else {
              binaryFiles[deployPath] = file.base64;
            }
          } else if (entry.isDirectory()) {
            await collectFiles(fullPath);
          }
        }
      }

      await collectFiles(finalBuildPath);

      // Use chatId instead of artifact.id
      const existingSiteId = getSavedDeployment(userId, provider, currentChatId)?.siteId;
      const studioProjectId = await ensureStudioProject(userId, currentChatId);
      const operation = deploymentOperation(userId, studioProjectId, provider);
      let cloudflareTarget: { accountId: string; projectName: string } | undefined;

      if (provider === 'cloudflare') {
        if (!target) {
          throw new Error('Choose your Cloudflare account and Pages project first.');
        }

        cloudflareTarget = target;
      }

      const response = await fetch(`/api/${provider}-deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId: existingSiteId || undefined,
          files,
          binaryFiles,
          expectedUserId: userId,
          chatId: currentChatId,
          studioProjectId,
          operationId: operation.id,
          ...cloudflareTarget,
        }),
      });

      const data = await readDeploymentResponse<DeploymentResult>(response);
      saveDeployment(userId, provider, currentChatId, data);
      operation.completed();

      const bindings: Record<string, string> | undefined = cloudflareTarget
        ? { cloudflareAccountId: cloudflareTarget.accountId!, cloudflareProjectName: cloudflareTarget.projectName! }
        : data.siteId
          ? { netlifySiteId: data.siteId }
          : undefined;

      if (bindings) {
        void updateStudioProject(userId, currentChatId, { bindings }).catch(() => {
          /* Deployment metadata already records the target. */
        });
      }

      const completed = await waitForDeployment(provider, data);
      saveDeployment(userId, provider, currentChatId, completed);

      // Notify that deployment completed successfully
      deployArtifact.runner.handleDeployAction('complete', 'complete', {
        url: completed.url || '',
        source: provider,
      });

      // Show success toast notification
      toast.success(`${provider === 'cloudflare' ? 'Cloudflare Pages' : 'Netlify'} deployment completed successfully!`);

      return true;
    } catch (error) {
      console.error('Deploy error:', error);
      toast.error(error instanceof Error ? error.message : 'Deployment failed');

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleNetlifyDeploy,
    isConnected: connectionState.connections[provider]?.status === 'connected',
  };
}
