# chat-gtp-assistant (wip)

Provides continuous conversation with microphone and speakers like using Google Assistant
After starting the script you'll be asked to resolve the captcha in the puppeteer browser instance the script will then
listen to your default microphone until silence of about 5 seconds has been reached, the language model will then try to
guess the things you said and pass them on to chatGPT and its output will be used to fetch googleTTS files to play on
the default system speaker

## How to use

1. Create `.env` file
    ```dotenv
        OPENAI_EMAIL="your_email"
        OPENAI_PASSWORD="your_password"
        CHROME_PATH="your_chrome_path"
    ```
2. `npm install`
3. install `sox` (if on windows) and libmad-0.dll for sox
4. install preferred `vosk` models for speech recognition, put them into `model/` folder
5. resolve other missing dependencies
6. `npm run dev`

