const express = require('express');
const axios = require('axios');
const winston = require('winston');
const {WebClient} = require("@slack/web-api");

const {combine, timestamp, json, errors} = winston.format;

// Configure Winston logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'debug',
    format: combine(errors({stack: true}), timestamp(), json()),
    transports: [new winston.transports.Console()],
});

// Constants
const PORT = process.env.PORT || 3000;
const SLACK_TOKEN = process.env.SLACK_TOKEN;

const FILE_ACTIONS = {
    AD: "Added",
    CH: "Changed",
    DE: "Deleted",
    RE: "Renamed",
    MV: "Moved"
};
const FILE_ICONS = {
    DIR: "📁",
    FILE: "📝"
};

// Validate required environment variables
if (!SLACK_TOKEN) {
    logger.error('SLACK_TOKEN environment variable is not set');
    process.exit(1);
}

const app = express();
const web = new WebClient(SLACK_TOKEN);

// Middleware to parse JSON body
app.use(express.json({limit: '50mb'}));

/**
 * Sends a message to Slack
 * @param {string} text - Message to send
 * @param {string} channel - Slack channel to send the message to
 * @param {string|null} thread_ts - Optional thread timestamp to reply in a thread
 * @returns {Promise<string|null>} - Message timestamp or null if error
 */
const sendToSlack = async (text, channel, thread_ts = null) => {
    try {
        const options = {
            channel: channel,
            text: text,
            ...(thread_ts && {thread_ts: thread_ts.toString()})
        };
        logger.debug(`Sending message to channel: ${channel}. Options ${JSON.stringify(options)}`);
        const result = await web.chat.postMessage(options);
        return result.ts;
    } catch (error) {
        logger.error('Error sending message to Slack:', {
            message: error.message,
            stack: error.stack,
            response: error.response ? error.response.data : null
        });
        return null;
    }
};

/**
 * Parse file information and group by action type
 * @param {string[]} files - Array of file strings to parse
 * @returns {Object} - Grouped files by action
 */
function parseAndGroupFiles(files) {
    const groups = {};

    files.forEach(file => {
        // Extract the first directory after "/Content/"
        const regex = /^(\w+)\s+"([^"]+)"\s+(\w+)#(.+)$/;
        const match = file.match(regex);
        if (!match) {
            logger.error("Could not parse file:", file);
            return;
        }

        const [, action, path, type, metadata] = match;

        if (!groups[action]) {
            groups[action] = [];
        }
        groups[action].push({path, type});
    });

    return groups;
}

/**
 * Send grouped files to Slack in formatted messages
 * @param {Object} files - Grouped files by action
 * @param {string} channel - Slack channel to send the message to
 * @param {string|null} thread_ts - Thread timestamp for replies
 * @returns {Promise<void>}
 */
const sendFilesInChunks = async (files, channel, thread_ts = null) => {
    const promises = Object.keys(files)
        .filter(action => FILE_ACTIONS[action])
        .map(async (action) => {
            let message = `*Files ${FILE_ACTIONS[action] || "Unknown"}*\n`;

            files[action].forEach(({path, type}) => {
                const icon = type === "DIR" ? FILE_ICONS.DIR : FILE_ICONS.FILE;
                message += `${icon} ${path}\n`;
            });

            message += "✄┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n";

            try {
                await sendToSlack(message, channel, thread_ts);
            } catch (error) {
                logger.error(`Error sending ${action} files to Slack:`, error);
            }
        });

    await Promise.all(promises);
};

app.use((err, req, res, next) => {
    logger.error('Unhandled middleware error:', err);
    res.status(500).send('Internal server error');
});

// Updated HTTP listener to use channel from URL path
app.post('/notify/:channel', async (req, res) => {
    try {
        const slackChannel = req.params.channel;
        if (!slackChannel) {
            logger.error('Missing channel parameter in URL');
            return res.status(400).send('Missing channel parameter');
        }

        logger.debug('Request body:', req.body);  // Add this line to log the request body

        const {PLASTIC_USER, PLASTIC_CLIENTMACHINE, content, INPUT} = req.body;

        if (!INPUT) {
            logger.error('Missing INPUT in request body');
            return res.status(400).send('Missing required fields');
        }

        logger.debug(`Received notification payload for channel: ${slackChannel}`);

        const initialMessage = `
*Author*: ${PLASTIC_USER || 'Unknown'}/${PLASTIC_CLIENTMACHINE || 'Unknown'}

${content || 'No content provided'}
`;

        let files;
        try {
            files = parseAndGroupFiles(JSON.parse(INPUT));
        } catch (parseError) {
            logger.error('Error parsing INPUT JSON:', parseError);
            return res.status(400).send('Invalid INPUT format');
        }

        const thread_ts = await sendToSlack(initialMessage, slackChannel);
        if (!thread_ts) {
            return res.status(500).send('Failed to send initial message to Slack');
        }

        await sendFilesInChunks(files, slackChannel, thread_ts);
        logger.debug('Notification sent to Slack successfully');
        res.status(200).send('Notification sent to Slack');
    } catch (error) {
        logger.error('Error processing notification:', error);
        res.status(500).send('Internal server error');
    }
});

// Keep the original route for backward compatibility (using SLACK_CHANNEL from env)
app.post('/notify', async (req, res) => {
    const SLACK_CHANNEL = process.env.SLACK_CHANNEL;
    if (!SLACK_CHANNEL) {
        logger.error('SLACK_CHANNEL environment variable is not set');
        return res.status(400).send('SLACK_CHANNEL environment variable is not set');
    }

    try {
        const {PLASTIC_USER, PLASTIC_CLIENTMACHINE, content, INPUT} = req.body;

        if (!INPUT) {
            logger.error('Missing INPUT in request body');
            return res.status(400).send('Missing required fields');
        }

        logger.debug('Received notification payload');

        const initialMessage = `
*Author*: ${PLASTIC_USER || 'Unknown'}/${PLASTIC_CLIENTMACHINE || 'Unknown'}

${content || 'No content provided'}
`;

        let files;
        try {
            files = parseAndGroupFiles(JSON.parse(INPUT));
        } catch (parseError) {
            logger.error('Error parsing INPUT JSON:', parseError);
            return res.status(400).send('Invalid INPUT format');
        }

        const thread_ts = await sendToSlack(initialMessage, SLACK_CHANNEL);
        if (!thread_ts) {
            return res.status(500).send('Failed to send initial message to Slack');
        }

        await sendFilesInChunks(files, SLACK_CHANNEL, thread_ts);
        logger.debug('Notification sent to Slack successfully');
        res.status(200).send('Notification sent to Slack');
    } catch (error) {
        logger.error('Error processing notification:', error);
        res.status(500).send('Internal server error');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Start the server
app.listen(PORT, () => {
    logger.info(`Server is listening on port ${PORT}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
});

