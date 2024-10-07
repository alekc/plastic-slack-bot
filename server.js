const express = require('express');
const axios = require('axios');
const winston = require('winston');
const {WebClient} = require("@slack/web-api");

const {combine, timestamp, json, errors} = winston.format;

const logger = winston.createLogger({
    level: 'debug',
    format: combine(errors({stack: true}), timestamp(), json()),
    transports: [new winston.transports.Console()],
});

const app = express();
const PORT = 3000;

const web = new WebClient(process.env.SLACK_TOKEN);

// Slack Webhook URL (replace with your actual webhook URL)
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/triggers/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';

// Middleware to parse JSON body
app.use(express.json());

// Function to send messages to Slack
const sendToSlack = async (text, thread_ts = null) => {
    try {
        const result = await web.chat.postMessage({
            channel: process.env.SLACK_CHANNEL,
            text: text,
            thread_ts: thread_ts
        });

        return result.ts;
    } catch (error) {
        console.error('Error sending message to Slack:', error.response ? error.response.data : error.message);
    }
    return null;
};

function splitIntoGroups(files) {
    const groups = [];

    files.forEach(file => {
        // Extract the first directory after "/Content/"
        const regex = /^(\w+)\s+"([^"]+)"\s+(\w+)#(.+)$/;
        const match = file.match(regex);
        if (!match) {
            logger.error("Could not parse file:", file);
            return;
        }

        const action = match[1];  // CH
        const path = match[2];    // "/Content"
        const type = match[3];    // DIR
        const metadata = match[4]; // br:/main;changeset:140@rep:EK_CST_VR@repserver:MytaverseVR@cloud

        if (!groups[action]) {
            groups[action] = [];
        }
        groups[action].push({path, type});
    });

    return groups;
}

// Split files into chunks to handle Slack's message length limitation
const sendFilesInChunks = async (files, thread_ts = null) => {
    for (const action of ["AD", "CH", "DE", "RE", "MV"]) {
        // no such action exists
        if (!files[action]) {
            continue;
        }
        let message = "*Files ";
        switch (action) {
            case "AD":
                message += "Added";
                break;
            case "CH":
                message += "Changed";
                break;
            case "DE":
                message += "Deleted";
                break;
            case "RE":
                message += "Renamed";
                break;
            case "MV":
                message += "Moved";
                break;
            default:
                logger.warn("Unknown action:", action);
                message = "UNKNOWN OPERATION";
        }
        message += "*\n";
        files[action].forEach(({path, type}) => {
            message += `* ${type} ${path}\n`;
        });
        message += "-ˋˏ✄┈┈┈┈┈┈┈┈┈┈┈┈┈\n";
        thread_ts = await sendToSlack(message, thread_ts);
        return thread_ts;
    }
};

// HTTP listener to receive JSON
app.post('/notify', async (req, res) => {
    const jsonMessage = req.body;

    logger.debug('Received JSON:', jsonMessage);

    const initialMessage = `
*Author*: ${jsonMessage.PLASTIC_USER}/${jsonMessage.PLASTIC_CLIENTMACHINE}

${jsonMessage.content}
`;
    let files = splitIntoGroups(JSON.parse(jsonMessage.INPUT))
    const thread_ts = await sendToSlack(initialMessage);

    sendFilesInChunks(files, thread_ts).then(() => {
        logger.debug('Notification sent to Slack');
        res.status(200).send('Notification sent to Slack');
    }).catch((error) => {
        logger.error('Error sending notification to Slack:', error);
        res.status(501).send('Error sending notification to Slack');
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});