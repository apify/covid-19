const Apify = require('apify');
const moment = require('moment-timezone');
const _ = require('lodash');

const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);

const LATEST ='LATEST';

Apify.main(async () => {
    const sourceUrl = 'http://sam.lrv.lt/lt/naujienos/koronavirusas';
    const kvStore = await Apify.openKeyValueStore("COVID-19-LITHUANIA");
    const dataset = await Apify.openDataset("COVID-19-LITHUANIA-HISTORY");

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
                readMe: "https://apify.com/dtrungtin/covid-lt",
            };

            const confirmedDateText = $('.text p:nth-child(2)').text();
            const matchUpadatedAt = confirmedDateText.match(/([^\s]+) (\d+).*(\d+).(\d+)/);

            // Kovo 17 d. 9.00 val. duomenimis:
            if (matchUpadatedAt && matchUpadatedAt.length > 4) {
                moment.locale('lt');
                const currentYear = moment().tz('Europe/Vilnius').year();
                const dateTimeStr = `${currentYear}.${matchUpadatedAt[1]}.${matchUpadatedAt[2]} ${matchUpadatedAt[3]}:${matchUpadatedAt[4]}`;
                console.log(dateTimeStr);
                const dateTime = moment.tz(dateTimeStr, "YYYY.MMMM.DD h:mm", 'Europe/Vilnius');
                data.lastUpdatedAtSource = dateTime.toISOString();
            } else {
                throw new Error('lastUpdatedAtSource not found');
            }

            const [confirmed] = $('.text > ul > li:nth-child(1)').text().match(/\d+/);
            const [died] = $('.text > ul > li:nth-child(3)').text().match(/\d+/);
            const [tested] = $('.text > ul > li:nth-child(6)').text().match(/\d+/);
            data.confirmedCases = parseInt(confirmed);
            data.testedCases = parseInt(tested);
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
