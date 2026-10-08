import { toast } from 'react-toastify';
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

export function useVercelDeploy() {
  const [isDeploying, setIsDeploying] = useState(false);
  const connectionState = useStore(deploymentConnections);
  const currentChatId = useStore(chatId);

  const handleVercelDeploy = async () => {
    const userId = connectionState.userId;

    if (!userId || !connectionState.connections.vercel) {
      toast.error('Connect Vercel from the Deploy menu first.');
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
      const deploymentId = `deploy-vercel-project`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: 'Vercel Deployment',
        type: 'standalone',
      });

      const deployArtifact = workbenchStore.artifacts.get()[deploymentId];

      // Notify that build is starting
      deployArtifact.runner.handleDeployAction('building', 'running', { source: 'vercel' });

      const actionId = 'build-' + Date.now();
      const actionData: ActionCallbackData = {
        messageId: 'vercel build',
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
          source: 'vercel',
        });
        throw new Error('Build failed');
      }

      // Notify that build succeeded and deployment is starting
      deployArtifact.runner.handleDeployAction('deploying', 'running', { source: 'vercel' });

      // Get the build files
      const container = await webcontainer;

      // Remove /home/project from buildPath if it exists
      const buildPath = buildOutput.path.replace('/home/project', '');

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
          break;
        } catch {
          // Directory doesn't exist, expected — just skip it
          continue;
        }
      }

      if (!buildPathExists) {
        throw new Error('Could not find build output directory. Please check your build configuration.');
      }

      // Get all files recursively
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

      /*
       * All source project files: framework detection, and the upload itself when
       * Vercel builds the project. Images under public/ or src/assets are part of
       * that upload, so they need the same binary-safe read as the build output.
       */
      const allProjectFiles: Record<string, string> = {};
      const binaryProjectFiles: Record<string, string> = {};

      async function getAllProjectFiles(dirPath: string): Promise<void> {
        const entries = await container.fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isFile()) {
            try {
              const file = await readDeployFile(container.fs, fullPath);

              // Store with relative path from project root
              let relativePath = fullPath;

              if (fullPath.startsWith('/home/project/')) {
                relativePath = fullPath.replace('/home/project/', '');
              } else if (fullPath.startsWith('./')) {
                relativePath = fullPath.replace('./', '');
              }

              if (file.kind === 'text') {
                allProjectFiles[relativePath] = addRayuCodeCredit(relativePath, file.content);
              } else {
                binaryProjectFiles[relativePath] = file.base64;
              }
            } catch (error) {
              // Skip files that cannot be read
              console.log(`Skipping file ${entry.name}: ${error}`);
            }
          } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await getAllProjectFiles(fullPath);
          }
        }
      }

      // Try to read from the current directory first
      try {
        await getAllProjectFiles('.');
      } catch {
        // Fallback to /home/project if current directory doesn't work
        await getAllProjectFiles('/home/project');
      }

      // Use chatId instead of artifact.id
      const existingProjectId = getSavedDeployment(userId, 'vercel', currentChatId)?.projectId;

      const response = await fetch('/api/vercel-deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: existingProjectId || undefined,
          files,
          binaryFiles,
          sourceFiles: allProjectFiles,
          binarySourceFiles: binaryProjectFiles,
          expectedUserId: userId,
          chatId: currentChatId,
        }),
      });

      const data = await readDeploymentResponse<DeploymentResult>(response);
      saveDeployment(userId, 'vercel', currentChatId, data);

      const completed = await waitForDeployment('vercel', data);
      saveDeployment(userId, 'vercel', currentChatId, completed);

      // Notify that deployment completed successfully
      deployArtifact.runner.handleDeployAction('complete', 'complete', {
        url: completed.url || '',
        source: 'vercel',
      });

      // Show success toast notification
      toast.success(`🚀 Vercel deployment completed successfully!`);

      return true;
    } catch (err) {
      console.error('Vercel deploy error:', err);
      toast.error(err instanceof Error ? err.message : 'Vercel deployment failed');

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleVercelDeploy,
    isConnected: !!connectionState.connections.vercel,
  };
}
