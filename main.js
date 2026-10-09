const {
    app,
    BrowserWindow,
    ipcMain,
    session
} = require("electron");

const path = require("path");

const googleTTS =
    require("google-tts-api");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const groqApiKey =
    process.env.GROQ_API_KEY;


async function groqRequest(
    endpoint,
    options
) {

    if (!groqApiKey) {
        throw new Error(
            "GROQ_API_KEY is missing from .env"
        );
    }


    const response =
        await fetch(
            `https://api.groq.com/openai/v1/${endpoint}`,
            {
                ...options,
                headers: {
                    Authorization: `Bearer ${groqApiKey}`,
                    ...(options.headers || {})
                }
            }
        );


    const data =
        await response.json();


    if (!response.ok) {
        throw new Error(
            data.error?.message ||
            `Groq request failed with status ${response.status}`
        );
    }


    return data;

}


ipcMain.handle(
    "groq:transcribe",
    async (_event, audioData) => {

        const formData =
            new FormData();


        formData.append(
            "file",
            new Blob(
                [Buffer.from(audioData)],
                {
                    type: "audio/webm"
                }
            ),
            "candi-recording.webm"
        );


        formData.append(
            "model",
            "whisper-large-v3-turbo"
        );

        formData.append(
            "response_format",
            "json"
        );


        const data =
            await groqRequest(
                "audio/transcriptions",
                {
                    method: "POST",
                    body: formData
                }
            );


        return data.text || "";

    }
);


ipcMain.handle(
    "groq:chat",
    async (_event, messages) => {

        if (!Array.isArray(messages)) {
            throw new Error(
                "Chat messages must be an array"
            );
        }


        const models =
            await groqRequest(
                "models",
                {
                    method: "GET"
                }
            );

        const preferredModels = [
            "openai/gpt-oss-20b",
            "openai/gpt-oss-120b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant"
        ];

        const availableModelIds =
            (models.data || []).map(
                (model) => model.id
            );

        const model =
            preferredModels.find(
                (modelId) =>
                    availableModelIds.includes(
                        modelId
                    )
            ) ||
            availableModelIds.find(
                (modelId) =>
                    !modelId.includes("whisper") &&
                    !modelId.includes("guard") &&
                    !modelId.includes("speech")
            );

        if (!model) {
            throw new Error(
                "No compatible Groq chat model is available for this API key"
            );
        }

        const data =
            await groqRequest(
                "chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model,
                        messages,
                        temperature: 0.7,
                        max_tokens: 500
                    })
                }
            );


        return data.choices?.[0]?.message?.content || "";

    }
);


ipcMain.handle(
    "groq:speak",
    async (_event, text) => {

        if (
            typeof text !== "string" ||
            !text.trim()
        ) {
            throw new Error(
                "Speech text must not be empty"
            );
        }


        const audioParts =
            await googleTTS.getAllAudioBase64(
                text,
                {
                    lang: "en",
                    slow: false,
                    timeout: 10000,
                    splitPunct: ",.?!"
                }
            );


        return audioParts.map(
            (part) => part.base64
        );

    }
);


function createWindow() {

    /*
     * Allow microphone access.
     */

    session.defaultSession.setPermissionRequestHandler(
        (webContents, permission, callback) => {

            if (permission === "media") {
                callback(true);
            } else {
                callback(false);
            }

        }
    );


    /*
     * Allow microphone permission checks.
     */

    session.defaultSession.setPermissionCheckHandler(
        (webContents, permission) => {

            if (permission === "media") {
                return true;
            }

            return false;

        }
    );


    const window = new BrowserWindow({

        width: 1000,

        height: 700,

        title: "CANDI - Particle Orb",

        webPreferences: {

            nodeIntegration: false,

            contextIsolation: true,

            sandbox: false,

            preload: path.join(
                __dirname,
                "preload.js"
            )

        }

    });


    window.loadFile("index.html");

}


app.whenReady().then(() => {

    createWindow();


    app.on(
        "activate",
        () => {

            if (
                BrowserWindow
                    .getAllWindows()
                    .length === 0
            ) {

                createWindow();

            }

        }
    );

});


app.on(
    "window-all-closed",
    () => {

        if (
            process.platform !== "darwin"
        ) {

            app.quit();

        }

    }
);