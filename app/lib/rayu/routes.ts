export const studioHome = (): string => '/';
export const studioChat = (id: string): string => `/chat/${id}`;
export const studioGit = (url?: string): string => (url ? `/git?url=${encodeURIComponent(url)}` : '/git');
export const studioRemote = (): string => '/remote';
export const studioPreview = (previewId: string): string => `/webcontainer/preview/${previewId}`;
