import {Readable, Stream} from "stream";

const fetch = require('node-fetch');
const vosk = require('vosk')
const fs = require("fs");
const SAMPLE_RATE = 44100
const Speaker = require('speaker');
const googleTTS = require('google-tts-api');
const sox = require('sox-stream')
require('dotenv').config();
const getMP3Duration = require('get-mp3-duration')
let chalk;
import('chalk').then((value) => {
    chalk = value.default;
})
const mic = require('mic');

const MODEL_PATH = "./model/vosk-model-en-us-0.22"; const LANGUAGE = "en"
//const MODEL_PATH = "./model/vosk-model-small-en-us-0.15"; const LANGUAGE = "en"
//const MODEL_PATH = "./model/vosk-model-de-0.21"; const LANGUAGE = "de"

if (!fs.existsSync(MODEL_PATH)) {
    console.log("Please download the model from https://alphacephei.com/vosk/models and unpack as " + MODEL_PATH + " in the current folder.")
    process.exit()
}

let api;
let chatResult;
let rec;
let model;

(async function () {
    vosk.setLogLevel(0);
    model = await new vosk.Model(MODEL_PATH);
    rec = new vosk.Recognizer({model: model, sampleRate: SAMPLE_RATE});
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
        executablePath: process.env.CHROME_PATH,
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
            lang: LANGUAGE,
            slow: false,
            host: 'https://translate.google.com',
            splitPunct: ',.?'
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
    const micInstance = mic({
        channels: '1',
        debug: false,
        exitOnSilence: 6
    });
    let micInputStream = micInstance.getAudioStream();

    console.log(chalk.bgGreen.black(' STARTED listening '));

    playWavFile('bleep');

    micInputStream.on('error', function (err) {
        console.log("Error in Input Stream: " + err);
    });

    micInputStream.on('silence', function () {
        playWavFile('endBleep');
        console.log(chalk.bgYellow.black(' STOPPED listening '));
        micInstance.stop();
    });

    micInstance.start();

    return micInputStream;
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
