const Apify = require('apify');
const moment = require('moment-timezone');
const _ = require('lodash');

const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);

const LATEST ='LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://www.bag.admin.ch/bag/en/home/krankheiten/ausbrueche-epidemien-pandemien/aktuelle-ausbrueche-epidemien/novel-cov/situation-schweiz-und-international.html';
    const kvStore = await Apify.openKeyValueStore("COVID-19-SWITZERLAND");
    const dataset = await Apify.openDataset("COVID-19-SWITZERLAND-HISTORY");

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
                readMe: "https://apify.com/dtrungtin/covid-ch",
            };

            const confirmedDateText = $('#content .row .main-content > div:nth-child(5) h3').text();
            let matchUpadatedAt = confirmedDateText.match(/(\d+).(\d+).(\d+), (\d+).(\d+) ([apm]+)/);
            if (!matchUpadatedAt) {
                matchUpadatedAt = confirmedDateText.match(/(\d+).(\d+).(\d+), (\d+) ([apm]+)/);
            }

            if (matchUpadatedAt && matchUpadatedAt.length > 6) {
                const dateTimeStr = `${matchUpadatedAt[3]}.${matchUpadatedAt[2]}.${matchUpadatedAt[1]} ${matchUpadatedAt[4]}:${matchUpadatedAt[5]} ${matchUpadatedAt[6]}`;
                const dateTime = moment.tz(dateTimeStr, "YYYY.MM.DD h:mm a", 'Europe/Zurich');
               
                data.lastUpdatedAtSource = dateTime.toISOString();
            } else if (matchUpadatedAt && matchUpadatedAt.length > 5) {
                const dateTimeStr = `${matchUpadatedAt[3]}.${matchUpadatedAt[2]}.${matchUpadatedAt[1]} ${matchUpadatedAt[4]}:00 ${matchUpadatedAt[5]}`;
                const dateTime = moment.tz(dateTimeStr, "YYYY.MM.DD h:mm a", 'Europe/Zurich');
               
                data.lastUpdatedAtSource = dateTime.toISOString();
            } else {
                throw new Error('lastUpdatedAtSource not found');
            }

            const numberOfCases = $('#content .row .main-content > div:nth-child(5) p:nth-child(3)').text();
            const [confirmed, died] = numberOfCases.match(/([\d,]+)/g);
            data.confirmedCases = parseInt(confirmed.replace(/,/, ''));
            data.numberOfDeaths = parseInt(died.replace(/,/, ''));

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
