const fetch = require('node-fetch');
const { Telegraf } = require('telegraf');
const { PublicKey } = require('@solana/web3.js');
const { performance } = require('perf_hooks');

// URL для подключения к Solana RPC
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

// Инициализация Telegram бота с вашим токеном
const TELEGRAM_TOKEN = 'TELEGRAM_TOKEN';
const bot = new Telegraf(TELEGRAM_TOKEN);

// Хранилище для уже просмотренных подписей транзакций
const seenSignatures = new Set();

async function getSignaturesForAddress(pubkey, before = null, limit = 1) {
    const headers = { 'Content-Type': 'application/json' };
    const params = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSignaturesForAddress",
        "params": [pubkey.toString(), { "limit": limit, "before": before }]
    };

    try {
        const response = await fetch(SOLANA_RPC_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(params)
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching signatures: ${error}`);
        return {};
    }
}

async function getTransactionInfo(txSignature) {
    const headers = { 'Content-Type': 'application/json' };
    const params = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [txSignature, { "encoding": "jsonParsed" }]
    };

    try {
        const response = await fetch(SOLANA_RPC_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(params)
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching transaction info: ${error}`);
        return {};
    }
}

async function fetchNewTransaction(pubkey, chatId) {
    while (true) {
        try {
            const response = await getSignaturesForAddress(pubkey);
            const result = response.result || [];

            if (result.length) {
                const signatureInfo = result[0];
                const signature = signatureInfo.signature;

                if (!seenSignatures.has(signature)) {
                    seenSignatures.add(signature);
                    const txInfo = await getTransactionInfo(signature);

                    if (txInfo.error) {
                        console.error(`Error fetching transaction info: ${txInfo.error.message}`);
                    } else {
                        try {
                            const transaction = txInfo.result.transaction;
                            for (const instruction of transaction.message.instructions) {
                                if (instruction.parsed && instruction.parsed.type === 'transfer') {
                                    const transferInfo = instruction.parsed.info;
                                    const destination = transferInfo.destination;
                                    const lamports = transferInfo.lamports;
                                    const source = transferInfo.source;

                                    const message = `New Transaction!\nSource: ${source}\nDestination: ${destination}\nAmount: ${lamports / 1e9} SOL`;
                                    await bot.telegram.sendMessage(chatId, message);
                                    break;
                                }
                            }
                        } catch (e) {
                            console.error(`Key error while parsing transaction info: ${e}`);
                        }
                    }
                }
            } else {
                console.log("No new signatures. Waiting before retrying...");
            }

            // Ожидание перед следующим запросом
            await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 2000));
        } catch (e) {
            console.error(`Error fetching transactions: ${e}`);
            await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 2000));
        }
    }
}

bot.start(async (ctx) => {
    await ctx.reply('Введите публичный ключ вашего кошелька Solana:');
});

bot.on('text', async (ctx) => {
    const publicKeyString = ctx.message.text.trim();
    try {
        const pubkey = new PublicKey(publicKeyString);
        await ctx.reply('Спасибо! Мы начали отслеживать транзакции вашего кошелька.');

        fetchNewTransaction(pubkey, ctx.chat.id);
    } catch (e) {
        await ctx.reply(`Ошибка: ${e.message}`);
        console.error(`Ошибка при обработке публичного ключа: ${e}`);
    }
});

bot.launch();
console.log('Бот запущен и готов к приему команд.');