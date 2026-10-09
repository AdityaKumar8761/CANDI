const {
    contextBridge,
    ipcRenderer
} = require("electron");


contextBridge.exposeInMainWorld(
    "candi",
    {
        transcribe: (audioData) =>
            ipcRenderer.invoke(
                "groq:transcribe",
                audioData
            ),

        chat: (messages) =>
            ipcRenderer.invoke(
                "groq:chat",
                messages
            ),

        speak: (text) =>
            ipcRenderer.invoke(
                "groq:speak",
                text
            )
    }
);
