import {pipeline, Readable, Stream} from "stream";

const fetch = require('node-fetch');
const vosk = require('vosk')
const fs = require("fs");
let Mic = require('node-microphone');
const SAMPLE_RATE = 44100
let mic = new Mic({/*bitwidth: 16, rate: SAMPLE_RATE, endian: 'big'*/});
const Speaker = require('speaker');
const googleTTS = require('google-tts-api');
const sox = require('sox-stream')
require('dotenv').config();
const getMP3Duration = require('get-mp3-duration')
let chalk;
import('chalk').then((value)=>{
    chalk = value.default;
})

const MODEL_PATH = "./model/vosk-model-en-us-0.22"
//const MODEL_PATH = "./model/vosk-model-small-en-us-0.15"
//const MODEL_PATH = "./model/vosk-model-de-0.21"

if (!fs.existsSync(MODEL_PATH)) {
    console.log("Please download the model from https://alphacephei.com/vosk/models and unpack as " + MODEL_PATH + " in the current folder.")
    process.exit()
}

vosk.setLogLevel(0);
const model = new vosk.Model(MODEL_PATH);
const rec = new vosk.Recognizer({model: model, sampleRate: SAMPLE_RATE});

let api;
let chatResult;

(async function () {
    await initChatGpt();
    await main();
})()


function stop() {
    console.log("Cleaning up");
    rec.free();
    model.free();
}

async function initChatGpt() {
    const {ChatGPTAPIBrowser} = await import('chatgpt')

    api = new ChatGPTAPIBrowser({
        email: process.env.OPENAI_EMAIL,
        password: process.env.OPENAI_PASSWORD,
        executablePath: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    })

    await api.initSession()
}


async function main() {
    const micStream = start();
    const buffer = await stream2buffer(micStream);
    rec.acceptWaveform(buffer);
    const speaker = new Speaker();
    Readable.from(buffer).pipe(speaker);

    const text = rec.result().text;
    console.log(`I heard: "${chalk.italic(text)}"`);
    console.log(`Generating result...`);

    //await api.initSession()
    chatResult = await api.sendMessage(text, chatResult ? {
        conversationId: chatResult.conversationId,
        parentMessageId: chatResult.messageId
    } : {})
    // result.response is a markdown-formatted string
    console.log(chalk.underline(chatResult.response));


    const urls = googleTTS
        .getAllAudioUrls(chatResult.response, {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com'
        })

    let bodies = []
    for (const {url} of urls) {
        const result = await fetch(url);
        bodies.push(result.body);
    }

    for (const [i, body] of bodies.entries()) {
        const transcode = sox({
            input: {
                type: 'mp3'
            },
            output: {
                bits: 16,
                rate: 44100,
                channels: 2,
                type: 'raw',
            }
        })
        const mp3Buffer = await stream2buffer(body);
        const duration = getMP3Duration(mp3Buffer);

        console.log(chalk.bgCyan.black(` ${i + 1} / ${bodies.length} `), `@${duration / 1000}s`);

        const speaker = new Speaker();
        Readable.from(mp3Buffer).pipe(transcode).pipe(speaker);
        await new Promise(resolve => {
            setTimeout(() => {
                resolve('')
            }, duration);
        })
    }

    main();
}

function start() {
    let micStream = mic.startRecording();
    console.log(chalk.bgGreen.black(' STARTED listening '));

    playWavFile('bleep');

    micStream.on('error', function () {
        stop();
    });

    setTimeout(() => {
        playWavFile('endBleep');
        console.log(chalk.bgYellow.black(' STOPPED listening '));
        mic.stopRecording();
    }, 10000)

    return micStream;
}

function playWavFile(fileName: string) {
    const transcode = sox({
        input: {
            type: 'wav'
        },
        output: {
            bits: 16,
            rate: 44100,
            channels: 2,
            type: 'raw',
        }
    })
    const speaker = new Speaker();
    fs.createReadStream('./files/' + fileName + '.wav')
        .pipe(transcode)
        .pipe(speaker);
}

async function stream2buffer(stream: Stream): Promise<Buffer> {

    return new Promise<Buffer>((resolve, reject) => {

        const _buf = Array<any>();

        stream.on("data", chunk => _buf.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(_buf)));
        stream.on("error", err => reject(`error converting stream - ${err}`));

    });
}
