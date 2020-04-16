const Apify = require('apify');
const moment = require('moment');
const _ = require('lodash');
const { log } = Apify.utils;
const Tesseract = require('tesseract.js');

const { createWorker } = Tesseract;

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0

const LATEST ='LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://www.santepubliquefrance.fr/maladies-et-traumatismes/maladies-et-infections-respiratoires/infection-a-coronavirus/articles/infection-au-nouveau-coronavirus-sars-cov-2-covid-19-france-et-monde';
    const kvStore = await Apify.openKeyValueStore("COVID-19-FRANCE");
    const dataset = await Apify.openDataset("COVID-19-FRANCE-HISTORY");

        const worker = createWorker();
        await worker.load();
        await worker.loadLanguage('fra');
        await worker.initialize('fra');

    const requestList = new Apify.RequestList({
        sources: [
            { url: sourceUrl },
        ],
    });
    await requestList.initialize();

    const crawler = new Apify.CheerioCrawler({
        requestList,
        handlePageFunction: async ({ request, html, $ }) => {
            log.info(`Processing ${request.url}...`);
            const data = {
                sourceUrl,
                lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
                readMe: "https://apify.com/drobnikj/covid-france",
            };

            const coronaBlock = $('#block-236243');
            const text = coronaBlock.text();

            const imgPathMatch = $('#block-228034').html().match(/img src=\"(\S*)\"/);
            if (!imgPathMatch || !imgPathMatch.length) {
                throw new Error('Image for OCR not found!');
            }
            const imgPath = imgPathMatch[1].replace('"', '');
            const imgUrl = `https://www.santepubliquefrance.fr${imgPath}`;
            // Match deceased from image from image, there are 6 rectangles with data
            const rectangleSizeLength = 420;

            // Match infected
            if (imgUrl) {
                const { data: { text: infected } } = await worker.recognize(imgUrl, {
                    rectangle:{ top: 65, left: 2 * rectangleSizeLength, width: 400, height: 95 },
                    classify_bln_numeric_mode: 1, tessedit_char_whitelist: '0123456789',
                });
                data.infected = parseInt(infected.replace(/\D/g, ''));
            } else {
                throw new Error('Infected not found');
            }

            // Can not get src from img probably because img tag is not complete on page HTML
            if (imgUrl) {
                const { data: { text: matchDeceased } } = await worker.recognize(imgUrl, {
                    rectangle:{ top: 490, left: 2 * rectangleSizeLength, width: rectangleSizeLength, height: 95 },
                    classify_bln_numeric_mode: 1, tessedit_char_whitelist: '0123456789',
                });
                data.deceased = parseInt(matchDeceased.replace(/\D/g, ''));
            } else {
                throw new Error('Deceased not found');
            }

            // Match updatedAt
            const h2Text = $('#block-228034').eq(0).text();
            const matchUpadatedAt = h2Text.match(/(\d+)\/(\d+)\/(\d+), arrêtés à (\d+)h/);
            if (matchUpadatedAt && matchUpadatedAt.length > 4) {
                data.lastUpdatedAtSource = moment({
                    year: parseInt(matchUpadatedAt[3]),
                    month: parseInt(matchUpadatedAt[2]) - 1,
                    date: parseInt(matchUpadatedAt[1]),
                    hour: parseInt(matchUpadatedAt[4]),
                    minute: 0,
                    second: 0,
                    millisecond: 0
                }).toISOString();
            } else {
                throw new Error('lastUpdatedAtSource not found');
            }

            console.log(data)

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            if (!_.isEqual(_.omit(data, 'lastUpdatedAtApify'), _.omit(latest, 'lastUpdatedAtApify'))) {
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            await Apify.pushData(data);
         },

        handleFailedRequestFunction: async ({ request }) => {
            throw new Error('Scrape didn\'t finish! Needs to be check!');
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    log.info('Crawler finished.');
});
