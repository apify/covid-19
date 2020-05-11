const Apify = require('apify');
const moment = require('moment-timezone');
const _ = require('lodash');

const { log } = Apify.utils;
// log.setLevel(log.LEVELS.WARNING);

const LATEST = 'LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://www.gov.si/en/topics/coronavirus-disease-covid-19/';
    const kvStore = await Apify.openKeyValueStore("COVID-19-SLOVENIA");
    const dataset = await Apify.openDataset("COVID-19-SLOVENIA-HISTORY");

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

            log.info('Processing and saving data')
            const data = {
                sourceUrl,
                lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
                readMe: "https://apify.com/dtrungtin/covid-si",
            };

            const columns = $('table tbody tr td');
            if (columns.length > 0) {
                const confirmedDateText = $(columns[0]).text();
                const tested = parseInt($(columns[1]).text());
                const positive = parseInt($(columns[2]).text());
                const hospitalized = parseInt($(columns[3]).text());
                const intensiveCare = parseInt($(columns[4]).text());
                const discharged = parseInt($(columns[5]).text());
                const died = parseInt($(columns[6]).text());

                const infected = positive + hospitalized + intensiveCare;

                const matchUpadatedAt = confirmedDateText.match(/(\d+).\s+(\d+).\s+(\d+)/);

                if (matchUpadatedAt && matchUpadatedAt.length > 3) {
                    data.lastUpdatedAtSource = moment({
                        year: parseInt(matchUpadatedAt[3]),
                        month: parseInt(matchUpadatedAt[2]) - 1,
                        date: parseInt(matchUpadatedAt[1]),
                        hour: 0,
                        minute: 0,
                        second: 0,
                        millisecond: 0
                    }).toISOString();
                } else {
                    throw new Error('lastUpdatedAtSource not found');
                }

                data.testedCases = tested;
                data.infectedCases = infected;
                data.numberOfDeath = died;
                data.discharged = discharged;
            }

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            if (!_.isEqual(_.omit(data, 'lastUpdatedAtApify'), _.omit(latest, 'lastUpdatedAtApify'))) {
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            await Apify.pushData(data);
            log.info('data saved')
        },

        handleFailedRequestFunction: async ({ request }) => {
            log.info(`Request ${request.url} failed twice.`);
        },
    });

    await crawler.run();

    log.info('Crawler finished.');
});
