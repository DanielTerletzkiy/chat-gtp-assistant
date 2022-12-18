const vosk = require('vosk')

const async = require("async");
const fs = require("fs");
const {Readable} = require("stream");
const wav = require("wav");
const Speaker = require('speaker');

const MODEL_PATH = "./model/vosk-model-en-us-0.22"

if (!fs.existsSync(MODEL_PATH)) {
    console.log("Please download the model from https://alphacephei.com/vosk/models and unpack as " + MODEL_PATH + " in the current folder.")
    process.exit()
}

// Process file 4 times in parallel with a single model
const files = Array(1).fill("./files/rec.wav")
const model = new vosk.Model(MODEL_PATH)

console.log(files);

async.filter(files, function (filePath, callback) {
    const wfReader = new wav.Reader();
    const wfReadable = new Readable().wrap(wfReader);

    const file = fs.createReadStream(filePath);

    wfReader.on('format', async (format) => {
        console.log(format)
        const {audioFormat, sampleRate, channels} = format;
        const speaker = new Speaker(format);
        file.pipe(speaker);

        const rec = new vosk.Recognizer({model: model, sampleRate: sampleRate});
        if (audioFormat != 1 || channels != 1) {
            console.error("Audio file must be WAV format mono PCM.");
            process.exit(1);
        }
        for await (const data of wfReadable) {
            const end_of_speech = await rec.acceptWaveformAsync(data);
            if (end_of_speech) {
                console.log(rec.result());
            }
        }
        console.log(rec.finalResult(rec));
        rec.free();
        // Signal we are done without errors
        callback(null, true);
    });

    file.pipe(wfReader);

}, function (err, results) {
    model.free();
    console.log("Done!!!!!");
});
