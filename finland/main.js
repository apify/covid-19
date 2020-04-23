const Apify = require('apify');
const moment = require('moment-timezone');
const _ = require('lodash');

const { log } = Apify.utils;
log.setLevel(log.LEVELS.INFO);

const LATEST ='LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://thl.fi/fi/web/infektiotaudit-ja-rokotukset/ajankohtaista/ajankohtaista-koronaviruksesta-covid-19/tilannekatsaus-koronaviruksesta';
    const kvStore = await Apify.openKeyValueStore("COVID-19-FINLAND");
    const dataset = await Apify.openDataset("COVID-19-FINLAND-HISTORY");

    const requestList = new Apify.RequestList({
        sources: [
            { url: sourceUrl },
        ],
    });
    await requestList.initialize();

    const crawler = new Apify.CheerioCrawler({
        requestList,
        maxRequestRetries: 1,
        handlePageTimeoutSecs: 60,

        handlePageFunction: async ({ request, $ }) => {
            log.info(`Processing ${request.url}...`);

            const data = {
                sourceUrl,
                lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
                readMe: "https://apify.com/dtrungtin/covid-fi",
            };

            const confirmedDateText = $('#column-2-2 .journal-content-article > p:nth-child(2)').text();
            const matchUpadatedAt = confirmedDateText.match(/(\d+).(\d+). klo (\d+).(\d+)/);

            if (matchUpadatedAt && matchUpadatedAt.length > 4) {
                const currentYear = moment().tz('Europe/Helsinki').year();
                const dateTimeStr = `${currentYear}.${matchUpadatedAt[2]}.${matchUpadatedAt[1]} ${matchUpadatedAt[3]}:${matchUpadatedAt[4]}`;
                const dateTime = moment.tz(dateTimeStr, "YYYY.MM.DD H:mm", 'Europe/Helsinki');
               
                data.lastUpdatedAtSource = dateTime.toISOString();
            } else {
                throw new Error('lastUpdatedAtSource not found');
            }

            // const liList = $('.journal-content-article').eq(0).find('ul li');
            // for (let index=0; index < liList.length; index++) {
            //     const el = $(liList[index]);
            //     if (el.text().includes('Finland')) {
            //         const confirmedCasesText = el.next().find('li:first-child').text();
            //         log.info(confirmedCasesText);
            //         const parts = confirmedCasesText.match(/\s+(\d+)\s+/);
            //         if (parts) {
            //             data.confirmedCases = parseInt(parts[1]);
            //             break;
            //         }
            //     }
            // }

            const testedText = $('.journal-content-article').eq(0).find('ul li').eq(0).text();
            let parts = testedText.match(/\s+(\d+\s*\d+)\s+/);
            if (parts) {
                data.tested = parseInt(parts[1].replace(/\s/, ''));
            }

            const infectedText = $('.journal-content-article').eq(0).find('ul li').eq(1).text();
            parts = infectedText.match(/\s+(\d+\s*\d+)\s+/);
            if (parts) {
                data.infected = parseInt(parts[1].replace(/\s/, ''));
            }

            const deathsText = $('.journal-content-article').eq(0).find('ul li').eq(3).text();
            parts = deathsText.match(/\s+(\d+\s*\d+)[.\s]+/);
            if (parts) {
                data.deaths = parseInt(parts[1].replace(/\s/, ''));
            }

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            if (!_.isEqual(_.omit(data, 'lastUpdatedAtApify'), _.omit(latest, 'lastUpdatedAtApify'))) {
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            await Apify.pushData(data);
        },

        handleFailedRequestFunction: async ({ request }) => {
            log.info(`Request ${request.url} failed twice.`);
        },
    });

    await crawler.run();

    log.info('Crawler finished.');
});
