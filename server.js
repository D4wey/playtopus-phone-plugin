const WebSocket = require('ws');
const mysql = require('mysql');
const { Client, Intents } = require('discord.js');

const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
});

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'playtopus',
});

// CF-SSL 8443
const server = new WebSocket.Server({
    port: 8443,
    maxPayload: 400,
});

const socket_rate_limit = new Map();

server.on('connection', (socket) => {

    socket_rate_limit.set(socket, {
        messageCount: 0,
        last_reset: Date.now(),
    });
    socket.on('message', (packet) => {
        function sqli(x) {
            const pattern = /^[a-zA-Z0-9-_]+$/;
            return pattern.test(x);
        }
        if (sqli(packet) == false) {
            send_channel_message('channel123', 'Exploit detected and mitigated. \n' + '```Packet: ' + packet + '```')
            return;
        }
        const now = Date.now();
        const ms_req = new Date();
        const rate_limit = socket_rate_limit.get(socket);
        if (now - rate_limit.last_reset >= 1000) {
            rate_limit.messageCount = 0;
            rate_limit.last_reset = now;
        }
        if (rate_limit.messageCount < 2) {
            rate_limit.messageCount++;
            const decoder = packet.toString('utf8');
            if (decoder.includes('request_habbo_imager')) {
                const SSOticket = sso_string_finder(decoder, 'request_habbo_imager');
                data_by_auth(SSOticket)
                    .then((userData) => {
                        const { username, look, id, health } = userData;
                        socket.send(JSON.stringify({ type: 'user_fetch', payload: { look: look, health: health } }));
                        send_channel_message('channel123', 'Incoming packet request. \n```Username: ' + username + '\nHealth: ' + health + '\nLook: ' + look + '\nMySQL Ping: ' + Math.floor(new Date().getTime() - ms_req.getTime()) + '```');
                    })
                    .catch((error) => {
                        console.error(error);
                    });
            }
        } else {
            console.log('Socket rate limited');
        }
    });
});

function sso_string_finder(x, y) {
    const regex = new RegExp(y + "(.*)");
    const match = x.match(regex);
    if (match) {
        const x = match[1].trim();
        return x;
    }
    return '';
}

function data_by_auth(sso) {
    return new Promise((resolve, reject) => {
        const query = `SELECT username, look, id, health FROM users WHERE auth_ticket = ?`;
        pool.query(query, [sso], (error, results) => {
            if (error) {
                reject(error);
            } else {
                if (results.length > 0) {
                    const payload = {
                        username: results[0].username,
                        look: results[0].look,
                        id: results[0].id,
                        health: results[0].health
                    };
                    resolve(payload);
                } else {
                    reject(new Error('User not found'));
                }
            }
        });
    });
}

client.on('messageCreate', (message) => {
    if (message.content === '!online') {
        const query = "SELECT COUNT(*) AS online_count FROM users WHERE online = '1'";
        pool.query(query, (error, results) => {
            if (error) {
                console.error('Error executing query:', error);
                return;
            }
            const online_count = results[0].online_count;
            message.reply(online_count.toString());
        });
    } else if (message.content.startsWith('!userinfo')) {
        const username = message.content.split(' ')[1];
        const query = 'SELECT motto, online, rank, gender, health FROM users WHERE username = ?';
        pool.query(query, [username], (error, results) => {
            if (error) {
                console.error('Error executing query:', error);
                return;
            }
            if (results.length > 0) {
                const user = results[0];
                let gender = '';
                let online = '';
                if(user.online == 0) online = 'No'
                if(user.online == 1) online = 'Yes'
                if(user.gender == 'F') gender = 'Female'
                if(user.gender == 'M') gender = 'Male'
                const info = `User: **${username}**\nMotto: **${user.motto}**\nRank: **${user.rank}**\nOnline: **${online}**\nGender: **${gender}**\nHealth: **${user.health}**`;
                message.reply(info);
            } else {
                message.reply('User not found');
            }
        });
    }
});

function send_channel_message(channel_id, msg) {
    client.channels.cache.get(channel_id).send(msg);
}

// v13 env
client.login('token123');
