const Apify = require('apify');
const moment = require('moment-timezone');
const _ = require('lodash');

const { log } = Apify.utils;
log.setLevel(log.LEVELS.INFO);

const LATEST ='LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://experience.arcgis.com/experience/d40b2aaf08be4b9c8ec38de30b714f26';
    const kvStore = await Apify.openKeyValueStore("COVID-19-FINLAND");
    const dataset = await Apify.openDataset("COVID-19-FINLAND-HISTORY");

    const requestList = new Apify.RequestList({
        sources: [
            { url: sourceUrl },
        ],
    });
    await requestList.initialize();

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        maxRequestRetries: 2,
        maxConcurrency: 1,

        handlePageFunction: async ({ request, page }) => {
            log.info(`Processing ${request.url}...`);

            const data = {
                sourceUrl,
                lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
                readMe: "https://apify.com/dtrungtin/covid-fi",
            };

            await page.waitForSelector('iframe');
            console.log('iframe is ready. Loading iframe content');

            const elementHandle = await page.$('iframe[src*="index.html"]');
            const frame = await elementHandle.contentFrame();

            const confirmedDateText = await frame.evaluate(() => {
                return $('.dock-element:nth-child(3)').text();
            });

            const matchUpadatedAt = confirmedDateText.match(/(\d+)\/(\d+)\/(\d+)/);

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

            const testedCasesText = await frame.evaluate(() => {
                return $('.dock-element:nth-child(2)').text();
            });

            const parts = testedCasesText.match(/[\d,]+/);
            if (parts) {
                data.testedCases = parseInt(parts[0].replace(/,/, ''));
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

        gotoFunction: async ({ page, request }) => {
            await page.viewport({ width: 1024, height: 768 });
            return page.goto(request.url, { waitUntil: 'networkidle0', timeout: 120000 });
        },
    });

    await crawler.run();
});
