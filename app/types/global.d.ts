interface Window {
  showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  webkitSpeechRecognition: typeof SpeechRecognition;
  SpeechRecognition: typeof SpeechRecognition;
  ipc?: {
    openExternal(url: string): Promise<void>;
    on(channel: string, listener: (...args: unknown[]) => void): () => void;
  };
}

interface Performance {
  memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
}
