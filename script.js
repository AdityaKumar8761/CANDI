
/* ============================================================
   CANVAS
============================================================ */

const canvas =
    document.getElementById("canvas");

const ctx =
    canvas.getContext("2d");


/* ============================================================
   CONFIGURATION
============================================================ */

const CONFIG = {

    particles: 1000,

    sphereSize: 0.28,

    perspective: 650,

    rotationSpeed: 0.0002,

    mouseRadius: 170,

    returnStrength: 0.008,

    damping: 0.88,

    maxDisplacement: 70

};


/* ============================================================
   CANVAS SIZE
============================================================ */

let width;
let height;

let centerX;
let centerY;

let sphereRadius;


function resize() {

    width =
        window.innerWidth;

    height =
        window.innerHeight;


    const pixelRatio =
        Math.min(
            window.devicePixelRatio || 1,
            2
        );


    canvas.width =
        width * pixelRatio;

    canvas.height =
        height * pixelRatio;


    canvas.style.width =
        width + "px";

    canvas.style.height =
        height + "px";


    ctx.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        0,
        0
    );


    centerX =
        width / 2;

    centerY =
        height / 2;


    sphereRadius =
        Math.min(
            width,
            height
        ) * CONFIG.sphereSize;

}


window.addEventListener(
    "resize",
    resize
);

resize();


/* ============================================================
   MOUSE
============================================================ */

const mouse = {

    x: -1000,

    y: -1000,

    active: false

};


window.addEventListener(
    "mousemove",
    (event) => {

        mouse.x =
            event.clientX;

        mouse.y =
            event.clientY;

        mouse.active =
            true;

    }
);


window.addEventListener(
    "mouseleave",
    () => {

        mouse.active =
            false;

    }
);


/* ============================================================
   CLICK PULSE
============================================================ */

let clickPulse = {

    x: 0,

    y: 0,

    strength: 0

};


window.addEventListener(
    "click",
    (event) => {

        clickPulse.x =
            event.clientX;

        clickPulse.y =
            event.clientY;

        clickPulse.strength =
            1;

    }
);


/* ============================================================
   MICROPHONE
============================================================ */

let audioContext = null;

let analyser = null;

let microphoneSource = null;

let microphoneStream = null;

let audioBuffer = null;

let microphoneStarted = false;


/*
    Smoothed microphone values.
*/

let voiceVolume = 0;

let voicePitch = 0;


/*
    Whether actual voice is currently detected.
*/

let voiceDetected = false;

let assistantSpeaking = false;

let assistantPitch = 0.42;

let currentAudio = null;

let currentAudioResolve = null;

let speechInterrupted = false;


/* ============================================================
   HEARTBEAT STATE
============================================================ */

/*
    This is deliberately independent from the
    animation clock.

    That means:

    voice starts
        ↓
    heartbeat starts

    voice continues
        ↓
    multiple beats

    pitch changes
        ↓
    heartbeat speed changes smoothly

    voice stops
        ↓
    heartbeat fades out
*/

let heartbeatPhase = 0;

let heartbeatStrength = 1;

let previousFrameTime = performance.now();


/* ============================================================
   START MICROPHONE
============================================================ */

async function startMicrophone() {

    if (microphoneStarted) {
        return;
    }


    try {

        microphoneStream =
            await navigator.mediaDevices.getUserMedia({

                audio: {

                    echoCancellation: true,

                    noiseSuppression: true,

                    autoGainControl: true

                }

            });


        audioContext =
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();


        await audioContext.resume();


        microphoneSource =
            audioContext.createMediaStreamSource(
                microphoneStream
            );


        analyser =
            audioContext.createAnalyser();


        analyser.fftSize =
            2048;


        analyser.smoothingTimeConstant =
            0.55;


        audioBuffer =
            new Float32Array(
                analyser.fftSize
            );


        microphoneSource.connect(
            analyser
        );


        microphoneStarted =
            true;


        console.log(
            "CANDI microphone started"
        );

    }

    catch (error) {

        console.error(
            "Could not access microphone:",
            error
        );

    }

}


/*
    Start microphone after first click.
*/

window.addEventListener(
    "click",
    () => {

        startMicrophone();

    },
    {
        once: true
    }
);


/* ============================================================
   VOICE CHAT
============================================================ */

const recordButton =
    document.getElementById("record-button");

const chatStatusElement =
    document.getElementById("chat-status");

let mediaRecorder = null;

let recordingChunks = [];

let recordingStartedAt = 0;

let silenceStartedAt = 0;

let voiceChatTimer = null;

let voiceChatActive = false;

let responseInProgress = false;

const conversation = [

    {
        role: "system",
        content:
            "You are CANDI, a concise and friendly voice assistant. " +
            "Answer naturally for spoken conversation."
    }

];


function setChatStatus(status) {

    chatStatusElement.textContent =
        status;

}


function speakResponse(text) {

    return new Promise(async (resolve, reject) => {

        assistantSpeaking =
            true;

        speechInterrupted =
            false;

        try {

            const audioParts =
                await window.candi.speak(
                    text
                );

            if (
                !Array.isArray(audioParts) ||
                audioParts.length === 0
            ) {
                throw new Error(
                    "Text-to-speech returned no audio"
                );
            }

            if (
                speechInterrupted
            ) {
                resolve();
                return;
            }


            for (
                const audioBase64 of audioParts
            ) {

                await playAudioPart(
                    audioBase64
                );

                if (
                    speechInterrupted
                ) {
                    resolve();
                    return;
                }

            }


            assistantSpeaking =
                false;

            responseInProgress =
                false;

            startListening();

            resolve();

        }

        catch (error) {

            assistantSpeaking =
                false;

            reject(error);

        }

    });

}


function playAudioPart(audioBase64) {

    return new Promise((resolve, reject) => {

        const audio =
            new Audio(
                `data:audio/mp3;base64,${audioBase64}`
            );

        currentAudio =
            audio;

        currentAudioResolve =
            resolve;

        audio.onended =
            () => {

                currentAudio =
                    null;

                currentAudioResolve =
                    null;

                resolve();

            };

        audio.onerror =
            () => {

                currentAudio =
                    null;

                currentAudioResolve =
                    null;

                reject(
                    new Error(
                        "The generated voice audio could not be played"
                    )
                );
            };

        audio.play().catch(
            reject
        );

    });

}


function interruptSpeech() {

    if (
        !assistantSpeaking
    ) {

        return;

    }


    speechInterrupted =
        true;


    if (
        currentAudio
    ) {

        currentAudio.pause();

        currentAudio.currentTime =
            0;

        currentAudio =
            null;

    }


    if (
        currentAudioResolve
    ) {

        const resolveAudio =
            currentAudioResolve;

        currentAudioResolve =
            null;

        resolveAudio();

    }


    assistantSpeaking =
        false;

    responseInProgress =
        false;

    setChatStatus(
        "Interrupted"
    );

    startListening();

}


document.addEventListener(
    "click",
    () => {

        interruptSpeech();

    }
);


async function processTranscript(userText) {

    try {

        responseInProgress =
            true;

        setChatStatus(
            "Thinking..."
        );


        conversation.push({
            role: "user",
            content: userText
        });


        const responseText =
            (
                await window.candi.chat(
                    conversation
                )
            ).trim();


        if (
            !responseText
        ) {

            throw new Error(
                "The assistant returned an empty response"
            );

        }


        const cleanResponse =
            cleanForSpeech(
                responseText
            );

        conversation.push({
            role: "assistant",
            content: cleanResponse
        });

        setChatStatus(
            "Speaking..."
        );

        await speakResponse(
            cleanResponse
        );

        setChatStatus(
            "Listening..."
        );

    }
    catch (error) {

        setChatStatus(
            "Chat error: " +
            (
                error.message ||
                "request failed"
            )
        );

        responseInProgress =
            false;

        startListening();

        console.error(
            "Voice chat failed:",
            error
        );

    }

}


function cleanForSpeech(text) {

    return text
        .replace(
            /```[\s\S]*?```/g,
            ""
        )
        .replace(
            /[*_~`#>|]+/g,
            " "
        )
        .replace(
            /(?:--|—|–)/g,
            " "
        )
        .replace(
            /^\s*\d+[.)]\s*/gm,
            ""
        )
        .replace(
            /\[([^\]]+)\]\([^)]+\)/g,
            "$1"
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();

}


function startListening() {

    if (
        voiceChatActive ||
        responseInProgress ||
        !microphoneStream
    ) {

        return;

    }


    mediaRecorder =
        new MediaRecorder(
            microphoneStream
        );

    recordingChunks =
        [];

    recordingStartedAt =
        0;

    silenceStartedAt =
        0;


    mediaRecorder.ondataavailable =
        (event) => {

            if (event.data.size > 0) {
                recordingChunks.push(
                    event.data
                );
            }

        };


    mediaRecorder.onstop =
        async () => {

            voiceChatActive =
                false;

            recordButton.classList.remove(
                "recording"
            );

            const audioBlob =
                new Blob(
                    recordingChunks,
                    {
                        type: "audio/webm"
                    }
                );


            if (
                audioBlob.size < 1000
            ) {

                startListening();

                return;

            }


            try {

                setChatStatus(
                    "Transcribing..."
                );

                const audioData =
                    new Uint8Array(
                        await audioBlob.arrayBuffer()
                    );

                const text =
                    (
                        await window.candi.transcribe(
                            audioData
                        )
                    ).trim();


                if (text) {
                    await processTranscript(
                        text
                    );
                }
                else {
                    startListening();
                }

            }

            catch (error) {

                setChatStatus(
                    "Transcription error: " +
                    error.message
                );

                console.error(
                    "Voice transcription failed:",
                    error
                );

                startListening();

            }

        };


    mediaRecorder.start();

    voiceChatActive =
        true;

    recordButton.classList.add(
        "recording"
    );

    recordButton.textContent =
        "Listening automatically";

    setChatStatus(
        "Listening..."
    );

}


function monitorVoiceActivity() {

    if (
        !voiceChatActive ||
        responseInProgress ||
        !mediaRecorder
    ) {

        return;

    }


    const volume =
        getMicrophoneVolume();

    const now =
        performance.now();


    if (
        volume > 0.035
    ) {

        if (!recordingStartedAt) {
            recordingStartedAt =
                now;
        }

        silenceStartedAt =
            0;

        setChatStatus(
            "Listening..."
        );

    }
    else if (
        recordingStartedAt
    ) {

        if (!silenceStartedAt) {
            silenceStartedAt =
                now;
        }

        if (
            now - silenceStartedAt > 900 &&
            now - recordingStartedAt > 350
        ) {

            mediaRecorder.stop();

        }

    }

}


function initializeVoiceChat() {

    startMicrophone()
        .then(
            () => {

                startListening();

                voiceChatTimer =
                    setInterval(
                        monitorVoiceActivity,
                        80
                    );

            }
        )
        .catch(
            (error) => {

                setChatStatus(
                    "Microphone access failed"
                );

                console.error(
                    "Could not start voice chat:",
                    error
                );

            }
        );

}


recordButton.addEventListener(
    "click",
    () => {

        responseInProgress =
            false;

        if (
            voiceChatActive
        ) {

            mediaRecorder.stop();

        }
        else {

            startListening();

        }

    }
);


initializeVoiceChat();


/* ============================================================
   MICROPHONE VOLUME
============================================================ */

function getMicrophoneVolume() {

    if (!analyser) {
        return 0;
    }


    analyser.getFloatTimeDomainData(
        audioBuffer
    );


    let sum = 0;


    for (
        let i = 0;
        i < audioBuffer.length;
        i++
    ) {

        const sample =
            audioBuffer[i];

        sum +=
            sample * sample;

    }


    const rms =
        Math.sqrt(
            sum / audioBuffer.length
        );


    /*
        Amplify microphone signal.

        Normal speech generally produces
        a relatively small RMS value.
    */

    let volume =
        rms * 7;


    volume =
        Math.min(
            volume,
            1
        );


    /*
        Noise gate.

        Tiny microphone noise should not
        make the orb heartbeat.
    */

    if (
        volume < 0.018
    ) {

        volume = 0;

    }


    /*
        Smooth the signal.
    */

    voiceVolume =
        voiceVolume * 0.72 +
        volume * 0.28;


    return voiceVolume;

}


/* ============================================================
   PITCH DETECTION
============================================================ */

function detectPitch(
    buffer,
    sampleRate
) {

    const size =
        buffer.length;


    /*
        RMS check.
    */

    let rms = 0;


    for (
        let i = 0;
        i < size;
        i++
    ) {

        rms +=
            buffer[i] *
            buffer[i];

    }


    rms =
        Math.sqrt(
            rms / size
        );


    if (
        rms < 0.012
    ) {

        return 0;

    }


    /*
        Human voice range:

        70 Hz  → low
        900 Hz → high
    */

    const minFrequency = 70;

    const maxFrequency = 900;


    const minPeriod =
        Math.floor(
            sampleRate /
            maxFrequency
        );


    const maxPeriod =
        Math.min(
            Math.floor(
                sampleRate /
                minFrequency
            ),
            size - 1
        );


    let bestCorrelation = 0;

    let bestOffset = -1;


    /*
        Autocorrelation.
    */

    for (
        let offset = minPeriod;
        offset <= maxPeriod;
        offset++
    ) {

        let correlation = 0;


        for (
            let i = 0;
            i < size - offset;
            i++
        ) {

            correlation +=
                buffer[i] *
                buffer[i + offset];

        }


        correlation /=
            size - offset;


        if (
            correlation >
            bestCorrelation
        ) {

            bestCorrelation =
                correlation;

            bestOffset =
                offset;

        }

    }


    if (
        bestOffset === -1 ||
        bestCorrelation < 0.01
    ) {

        return 0;

    }


    const frequency =
        sampleRate /
        bestOffset;


    if (
        frequency < 70 ||
        frequency > 900
    ) {

        return 0;

    }


    /*
        Convert pitch to 0-1.
    */

    let normalized =
        (
            frequency - 70
        ) /
        (
            900 - 70
        );


    normalized =
        Math.max(
            0,
            Math.min(
                1,
                normalized
            )
        );


    /*
        Smooth pitch.

        This is important because pitch naturally
        fluctuates while speaking.
    */

    voicePitch =
        voicePitch * 0.88 +
        normalized * 0.12;


    return voicePitch;

}


/* ============================================================
   UPDATE VOICE
============================================================ */

function updateVoice() {

    if (
        !microphoneStarted
    ) {

        voiceVolume *= 0.90;

        voicePitch *= 0.98;

        voiceDetected =
            false;

        return;

    }


    const volume =
        getMicrophoneVolume();


    const pitch =
        detectPitch(
            audioBuffer,
            audioContext.sampleRate
        );


    voiceVolume =
        volume;


    voicePitch =
        pitch;


    /*
        Voice detection threshold.

        This prevents the heartbeat from
        continuing on tiny background noise.
    */

    voiceDetected =
        voiceVolume > 0.022;

}


/* ============================================================
   HEARTBEAT
============================================================ */

function updateHeartbeat(deltaTime) {

    /*
        deltaTime is milliseconds.

        Convert to seconds.
    */

    const dt =
        Math.min(
            deltaTime / 1000,
            0.05
        );


    if (
        voiceDetected ||
        assistantSpeaking
    ) {

        /*
            Higher pitch:

                faster heartbeat

            Lower pitch:

                slower heartbeat

            Approximate range:

                1.0 beats/sec
                to
                2.4 beats/sec
        */

        const beatsPerSecond =
            1.0 +
            (
                voiceDetected ?
                    voicePitch :
                    assistantPitch
            ) * 1.4;


        /*
            Advance phase instead of calculating
            heartbeat directly from absolute time.

            This is what allows the heartbeat
            to continue smoothly when pitch changes.
        */

        heartbeatPhase +=
            dt *
            beatsPerSecond *
            Math.PI *
            2;


        if (
            heartbeatPhase >
            Math.PI * 2
        ) {

            heartbeatPhase -=
                Math.PI * 2;

        }


        /*
            Volume controls the maximum
            heartbeat strength.

            Make it more visible than
            the previous version.
        */

        const targetStrength =
            assistantSpeaking ?
                0.5 :
                Math.min(
                    1,
                    voiceVolume * 1.35
                );


        /*
            Smooth attack.

            The heartbeat becomes visible
            quickly when speech starts.
        */

        heartbeatStrength +=
            (
                targetStrength -
                heartbeatStrength
            ) *
            0.5;

    }

    else {

        /*
            Smoothly remove heartbeat when
            the user stops speaking.
        */

        heartbeatStrength *=
            Math.pow(
                0.04,
                dt
            );


        /*
            Completely stop once tiny.
        */

        if (
            heartbeatStrength <
            0.002
        ) {

            heartbeatStrength =
                0;

        }

    }

}


/* ============================================================
   HEARTBEAT SHAPE
============================================================ */

function getHeartbeatValue() {

    /*
        If completely silent, no expansion.
    */

    if (
        heartbeatStrength <= 0
    ) {

        return 0;

    }


    /*
        Current position inside heartbeat cycle.

        0 → 2PI
    */

    const phase =
        heartbeatPhase %
        (Math.PI * 2);


    /*
        MAIN BEAT

        Strong fast contraction/expansion.
    */

    const main =
        Math.max(
            0,
            Math.sin(
                phase
            )
        );


    /*
        Shape it sharply so it feels
        more like a heartbeat rather
        than a smooth breathing animation.
    */

    const mainBeat =
        Math.pow(
            main,
            3.0
        );


    /*
        SECONDARY BEAT

        Smaller beat immediately after
        the main beat.
    */

    let secondaryBeat = 0;


    const secondaryWave =
        Math.sin(
            phase * 2
        );


    if (
        phase > 0.9 &&
        phase < 3.4 &&
        secondaryWave > 0
    ) {

        secondaryBeat =
            Math.pow(
                secondaryWave,
                4
            ) *
            0.42;

    }


    /*
        Combine them.

        This gives:

            BOOM - boom
                 pause
            BOOM - boom
                 pause
    */

    const heartbeat =
        Math.min(
            1,
            mainBeat +
            secondaryBeat
        );


    return (
        heartbeat *
        heartbeatStrength
    );

}


/* ============================================================
   PARTICLE
============================================================ */

class Particle {

    constructor() {

        this.createPosition();


        this.vx = 0;

        this.vy = 0;

        this.vz = 0;


        this.size =
            0.5 +
            Math.random() * 1.5;


        this.alpha =
            0.35 +
            Math.random() * 0.65;


        this.noiseOffset =
            Math.random() *
            Math.PI *
            2;


        this.noiseSpeed =
            0.00015 +
            Math.random() * 0.0002;

    }


    /* --------------------------------------------------------
       CREATE SPHERICAL POSITION
    -------------------------------------------------------- */

    createPosition() {

        const theta =
            Math.random() *
            Math.PI *
            2;


        const phi =
            Math.acos(
                2 *
                Math.random() -
                1
            );


        this.baseX =
            Math.sin(phi) *
            Math.cos(theta);


        this.baseY =
            Math.sin(phi) *
            Math.sin(theta);


        this.baseZ =
            Math.cos(phi);


        this.x =
            this.baseX *
            sphereRadius;


        this.y =
            this.baseY *
            sphereRadius;


        this.z =
            this.baseZ *
            sphereRadius;

    }


    /* --------------------------------------------------------
       UPDATE
    -------------------------------------------------------- */

    update(time) {

        /*
            ORIGINAL ROTATION
        */

        const rotationY =
            time *
            CONFIG.rotationSpeed;


        const rotationX =
            Math.sin(
                time *
                0.00008
            ) *
            0.05;


        const cosY =
            Math.cos(
                rotationY
            );


        const sinY =
            Math.sin(
                rotationY
            );


        const cosX =
            Math.cos(
                rotationX
            );


        const sinX =
            Math.sin(
                rotationX
            );


        /*
            ORIGINAL SPHERE
        */

        let targetX =
            this.baseX *
            sphereRadius;


        let targetY =
            this.baseY *
            sphereRadius;


        let targetZ =
            this.baseZ *
            sphereRadius;


        /* ====================================================
           VOICE HEARTBEAT
        ==================================================== */

        const heartbeat =
            getHeartbeatValue();


        /*
            Expand the entire sphere radially.

            0.24 gives a visible but controlled
            heartbeat without destroying the orb.
        */

        const expansion =
            heartbeat *
            0.24;


        targetX *=
            1 + expansion;


        targetY *=
            1 + expansion;


        targetZ *=
            1 + expansion;


        /* ====================================================
           Y ROTATION
        ==================================================== */

        const x1 =
            targetX *
            cosY -
            targetZ *
            sinY;


        const z1 =
            targetX *
            sinY +
            targetZ *
            cosY;


        targetX =
            x1;


        targetZ =
            z1;


        /* ====================================================
           X ROTATION
        ==================================================== */

        const y1 =
            targetY *
            cosX -
            targetZ *
            sinX;


        const z2 =
            targetY *
            sinX +
            targetZ *
            cosX;


        targetY =
            y1;


        targetZ =
            z2;


        /* ====================================================
           ORGANIC MOVEMENT
        ==================================================== */

        const noise =
            Math.sin(
                time *
                this.noiseSpeed +
                this.noiseOffset
            );


        targetX +=
            noise *
            0.6;


        targetY +=
            Math.cos(
                time *
                this.noiseSpeed +
                this.noiseOffset
            ) *
            0.6;


        /* ====================================================
           MOUSE INTERACTION
        ==================================================== */

        let mouseForceX = 0;

        let mouseForceY = 0;

        let mouseForceZ = 0;


        if (
            mouse.active
        ) {

            const scale =
                CONFIG.perspective /
                (
                    CONFIG.perspective +
                    this.z
                );


            const screenX =
                centerX +
                this.x *
                scale;


            const screenY =
                centerY +
                this.y *
                scale;


            const dx =
                screenX -
                mouse.x;


            const dy =
                screenY -
                mouse.y;


            const distance =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );


            if (
                distance <
                CONFIG.mouseRadius &&
                distance >
                0.001
            ) {

                const force =
                    1 -
                    distance /
                    CONFIG.mouseRadius;


                const strength =
                    force *
                    force;


                const angle =
                    Math.atan2(
                        dy,
                        dx
                    );


                mouseForceX =
                    Math.cos(angle) *
                    strength *
                    3.0;


                mouseForceY =
                    Math.sin(angle) *
                    strength *
                    3.0;


                mouseForceZ =
                    strength *
                    1.5;

            }

        }


        /* ====================================================
           CLICK PULSE
        ==================================================== */

        if (
            clickPulse.strength >
            0
        ) {

            const dx =
                this.x +
                centerX -
                clickPulse.x;


            const dy =
                this.y +
                centerY -
                clickPulse.y;


            const distance =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );


            if (
                distance < 180 &&
                distance > 0.001
            ) {

                const force =
                    1 -
                    distance /
                    180;


                mouseForceX +=
                    (
                        dx /
                        distance
                    ) *
                    force *
                    clickPulse.strength *
                    2;


                mouseForceY +=
                    (
                        dy /
                        distance
                    ) *
                    force *
                    clickPulse.strength *
                    2;

            }

        }


        /* ====================================================
           SPRING
        ==================================================== */

        this.vx +=
            (
                targetX -
                this.x
            ) *
            CONFIG.returnStrength;


        this.vy +=
            (
                targetY -
                this.y
            ) *
            CONFIG.returnStrength;


        this.vz +=
            (
                targetZ -
                this.z
            ) *
            CONFIG.returnStrength;


        /* ====================================================
           MOUSE FORCE
        ==================================================== */

        this.vx +=
            mouseForceX;


        this.vy +=
            mouseForceY;


        this.vz +=
            mouseForceZ;


        /* ====================================================
           DAMPING
        ==================================================== */

        this.vx *=
            CONFIG.damping;


        this.vy *=
            CONFIG.damping;


        this.vz *=
            CONFIG.damping;


        /* ====================================================
           VELOCITY LIMIT
        ==================================================== */

        const velocity =
            Math.sqrt(
                this.vx * this.vx +
                this.vy * this.vy +
                this.vz * this.vz
            );


        const maxVelocity =
            2.5;


        if (
            velocity >
            maxVelocity
        ) {

            const factor =
                maxVelocity /
                velocity;


            this.vx *=
                factor;


            this.vy *=
                factor;


            this.vz *=
                factor;

        }


        /* ====================================================
           POSITION
        ==================================================== */

        this.x +=
            this.vx;


        this.y +=
            this.vy;


        this.z +=
            this.vz;


        /* ====================================================
           SPHERICAL BOUNDARY
        ==================================================== */

        const distanceFromCenter =
            Math.sqrt(
                this.x * this.x +
                this.y * this.y +
                this.z * this.z
            );


        const maximumDistance =
            sphereRadius +
            CONFIG.maxDisplacement;


        if (
            distanceFromCenter >
            maximumDistance
        ) {

            const factor =
                maximumDistance /
                distanceFromCenter;


            this.x *=
                factor;


            this.y *=
                factor;


            this.z *=
                factor;


            this.vx *=
                0.5;


            this.vy *=
                0.5;


            this.vz *=
                0.5;

        }

    }


    /* --------------------------------------------------------
       DRAW
    -------------------------------------------------------- */

    draw() {

        const scale =
            CONFIG.perspective /
            (
                CONFIG.perspective +
                this.z
            );


        const screenX =
            centerX +
            this.x *
            scale;


        const screenY =
            centerY +
            this.y *
            scale;


        const size =
            this.size *
            scale;


        const depth =
            Math.max(
                0.15,
                Math.min(
                    1,
                    scale
                )
            );


        ctx.beginPath();


        ctx.arc(
            screenX,
            screenY,
            Math.max(
                0.35,
                size
            ),
            0,
            Math.PI * 2
        );


        ctx.fillStyle =
            `rgba(
                255,
                255,
                255,
                ${this.alpha * depth}
            )`;


        ctx.fill();

    }

}


/* ============================================================
   CREATE PARTICLES
============================================================ */

const particles = [];


for (
    let i = 0;
    i < CONFIG.particles;
    i++
) {

    particles.push(
        new Particle()
    );

}


/* ============================================================
   SORT PARTICLES
============================================================ */

function sortParticles() {

    particles.sort(
        (a, b) =>
            a.z - b.z
    );

}


/* ============================================================
   CONNECTIONS
============================================================ */

function drawConnections() {

    const connectionDistance =
        55;


    for (
        let i = 0;
        i < particles.length;
        i += 4
    ) {

        const a =
            particles[i];


        const scaleA =
            CONFIG.perspective /
            (
                CONFIG.perspective +
                a.z
            );


        const ax =
            centerX +
            a.x *
            scaleA;


        const ay =
            centerY +
            a.y *
            scaleA;


        for (
            let j = i + 4;
            j < Math.min(
                i + 40,
                particles.length
            );
            j += 4
        ) {

            const b =
                particles[j];


            const scaleB =
                CONFIG.perspective /
                (
                    CONFIG.perspective +
                    b.z
                );


            const bx =
                centerX +
                b.x *
                scaleB;


            const by =
                centerY +
                b.y *
                scaleB;


            const dx =
                ax - bx;


            const dy =
                ay - by;


            const distance =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );


            if (
                distance <
                connectionDistance
            ) {

                const opacity =
                    (
                        1 -
                        distance /
                        connectionDistance
                    ) *
                    0.08;


                ctx.beginPath();


                ctx.moveTo(
                    ax,
                    ay
                );


                ctx.lineTo(
                    bx,
                    by
                );


                ctx.strokeStyle =
                    `rgba(
                        255,
                        255,
                        255,
                        ${opacity}
                    )`;


                ctx.lineWidth =
                    0.4;


                ctx.stroke();

            }

        }

    }

}


/* ============================================================
   ORB GLOW
============================================================ */

function drawGlow() {

    const gradient =
        ctx.createRadialGradient(

            centerX,
            centerY,

            sphereRadius * 0.15,

            centerX,
            centerY,

            sphereRadius * 1.15

        );


    gradient.addColorStop(
        0,
        "rgba(255,255,255,0.025)"
    );


    gradient.addColorStop(
        0.45,
        "rgba(255,255,255,0.012)"
    );


    gradient.addColorStop(
        1,
        "rgba(255,255,255,0)"
    );


    ctx.beginPath();


    ctx.arc(
        centerX,
        centerY,
        sphereRadius * 1.15,
        0,
        Math.PI * 2
    );


    ctx.fillStyle =
        gradient;


    ctx.fill();

}


/* ============================================================
   MAIN ANIMATION
============================================================ */

function animate(time) {

    /*
        Calculate frame delta.

        This allows the heartbeat to continue smoothly
        regardless of frame rate.
    */

    const deltaTime =
        time -
        previousFrameTime;


    previousFrameTime =
        time;


    /* ========================================================
       BACKGROUND
    ======================================================== */

    ctx.fillStyle =
        "#030303";


    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    /* ========================================================
       MICROPHONE
    ======================================================== */

    updateVoice();


    /* ========================================================
       HEARTBEAT
    ======================================================== */

    updateHeartbeat(
        deltaTime
    );


    /* ========================================================
       GLOW
    ======================================================== */

    drawGlow();


    /* ========================================================
       PARTICLES
    ======================================================== */

    for (
        const particle of particles
    ) {

        particle.update(
            time
        );

    }


    /* ========================================================
       SORT
    ======================================================== */

    sortParticles();


    /* ========================================================
       CONNECTIONS
    ======================================================== */

    drawConnections();


    /* ========================================================
       DRAW PARTICLES
    ======================================================== */

    for (
        const particle of particles
    ) {

        particle.draw();

    }


    /* ========================================================
       CLICK PULSE
    ======================================================== */

    clickPulse.strength *=
        0.92;


    if (
        clickPulse.strength <
        0.01
    ) {

        clickPulse.strength =
            0;

    }


    requestAnimationFrame(
        animate
    );

}


/* ============================================================
   START
============================================================ */

requestAnimationFrame(
    animate
);
