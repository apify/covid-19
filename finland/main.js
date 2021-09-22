const Apify = require('apify');
// const moment = require('moment-timezone');
const _ = require('lodash');

const { log } = Apify.utils;
log.setLevel(log.LEVELS.INFO);

const LATEST = 'LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://thl.fi/en/web/infectious-diseases-and-vaccinations/what-s-new/coronavirus-covid-19-latest-updates/situation-update-on-coronavirus';
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

        handlePageFunction: async ({ request, $, body }) => {

            log.info(`Processing ${request.url}...`);

            const now = new Date();

            const confirmedDateText = $('#column-2-2 .journal-content-article > p:nth-child(2)').text();
            const matchUpadatedAt = confirmedDateText.match(/(\d+).(\d+). klo (\d+).(\d+)/);

            const infected = Number($('li:contains(Reported cases in total)').text().split('(')[0].replace(/\D/g,''));
            const infectedDaily = Number($('li:contains(Reported cases in total)').text().split('(')[1].split(')')[0].replace(/\D/g,''));
            const tested = Number($('li:contains(Tested samples in total approx)').text().split('(')[0].replace(/\D/g,''))
            const testedDaily = Number($('li:contains(Tested samples in total approx)').text().split('(')[1].replace(/\D/g,''));
            const deaths = Number($('li:contains(Cumulative number of deaths associated with the disease:)').text().split('(')[0].replace(/\D/g,''));
            const deathsDaily = Number($('li:contains(Cumulative number of deaths associated with the disease:)').text().split('(')[1].replace(/\D/g,''));
            const ICU = Number($('li:contains(Number of patients in intensive care)').text().split('(')[0].replace(/\D/g,''));
            const ICUDaily = Number($('li:contains(Number of patients in intensive care)').text().split('(')[1].replace(/\D/g,''));
            const specializedHealthCare = Number($('li:contains(Number of patients in specialised medical care wards)').text().split('(')[0].replace(/\D/g,''));
            const specializedHealthCareDaily = Number($('li:contains(Number of patients in specialised medical care wards)').text().split('(')[1].replace(/\D/g,''));
            const primaryHealthCare = Number($('li:contains(Number of patients in primary)').text().split('(')[0].replace(/\D/g,''));
            const primaryHealthCareDaily = Number($('li:contains(Number of patients in primary)').text().split('(')[1].replace(/\D/g,''));
            
            const data = {
                infected,
                infectedDaily,
                tested,
                testedDaily,
                deaths,
                deathsDaily,
                ICU,
                ICUDaily,
                specializedHealthCare,
                specializedHealthCareDaily,
                primaryHealthCare,
                primaryHealthCareDaily,
                country: "Finland",
                historyData: "https://api.apify.com/v2/datasets/BDEAOLx0DzEW91s5L/items?format=json&clean=1",
                sourceUrl,
                readMe: "https://apify.com/dtrungtin/covid-fi",
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString()
                // lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
            };

            console.log(data);
            


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
