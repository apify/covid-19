const Apify = require('apify');
const moment = require('moment-timezone');
const _ = require('lodash');

const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);

const LATEST ='LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://ncov.moh.gov.vn/';
    const kvStore = await Apify.openKeyValueStore("COVID-19-VIETNAM");
    const dataset = await Apify.openDataset("COVID-19-VIETNAM-HISTORY");

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
                readMe: "https://apify.com/dtrungtin/covid-vi",
            };

            const confirmedDateText = $('.journal-content-article h1').text();
            let matchUpadatedAt = confirmedDateText.match(/(\d+)h(\d+).*(\d+)\/(\d+)\/(\d+)/);

            if (matchUpadatedAt && matchUpadatedAt.length > 5) {
                const dateTimeStr = `${matchUpadatedAt[5]}.${matchUpadatedAt[4]}.${matchUpadatedAt[3]} ${matchUpadatedAt[0]}:${matchUpadatedAt[1]}`;
                const dateTime = moment.tz(dateTimeStr, "YYYY.MM.DD h:mm a", 'Asia/Ho_Chi_Minh');
               
                data.lastUpdatedAtSource = dateTime.toISOString();
            } else {
                throw new Error('lastUpdatedAtSource not found');
            }

            const died = $('.journal-content-article .row:nth-child(2) span span').text().trim();
            const confirmed = $('.journal-content-article .row:nth-child(3) div.col-md-9 .text-danger2').text().trim();
            data.confirmedCases = parseInt(confirmed);
            data.numberOfDeaths = parseInt(died);

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
