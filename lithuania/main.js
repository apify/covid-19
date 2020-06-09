
const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const sourceUrl = 'http://sam.lrv.lt/lt/naujienos/koronavirusas';
const LATEST = 'LATEST';

Apify.main(async () => {

    const kvStore = await Apify.openKeyValueStore("COVID-19-LITHUANIA");
    const dataset = await Apify.openDataset("COVID-19-LITHUANIA-HISTORY");

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);
    const infected = $('#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul > li:nth-child(1) > strong').text();
    const deceased = $('#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul > li:nth-child(4) > strong').text();
    const recovered = $("#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul > li:nth-child(6) > strong").text();
    const newInfected = $("#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul > li:nth-child(3) > strong").text();
    const isolated = $("#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul > li:nth-child(3) > strong").text();
    const connectedDeaths = $('#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul > li:nth-child(5) > strong').text();
    const stillSick = $('#module_Structure > div.wrapper > div.main_content.clearfix > div:nth-child(3) > div.text > ul > li:nth-child(2) > strong').text();
    
    const now = new Date();

    const result = {
        infected,
        recovered,
        deceased,
        newInfected,
        isolated,
        connectedDeaths,
        stillSick,
        sourceUrl: 'http://sam.lrv.lt/lt/naujienos/koronavirusas',
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: 'https://apify.com/dtrungtin/covid-lt'
    };
    console.log(result)

    let latest = await kvStore.getValue(LATEST);
    if (!latest) {
        await kvStore.setValue('LATEST', result);
        latest = result;
    }
    delete latest.lastUpdatedAtApify;
    const actual = Object.assign({}, result);
    delete actual.lastUpdatedAtApify;

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(result);
    }

    await kvStore.setValue('LATEST', result);
    await Apify.pushData(result);
}
);



// old actor

// const Apify = require('apify');
// const moment = require('moment-timezone');
// const _ = require('lodash');

// const { log } = Apify.utils;
// log.setLevel(log.LEVELS.WARNING);

// const LATEST ='LATEST';

// Apify.main(async () => {
//     const sourceUrl = 'http://sam.lrv.lt/lt/naujienos/koronavirusas';
//     const kvStore = await Apify.openKeyValueStore("COVID-19-LITHUANIA");
//     const dataset = await Apify.openDataset("COVID-19-LITHUANIA-HISTORY");

//     const requestList = new Apify.RequestList({
//         sources: [
//             { url: sourceUrl },
//         ],
//     });
//     await requestList.initialize();

//     const crawler = new Apify.CheerioCrawler({
//         requestList,
//         maxRequestRetries: 1,
//         handlePageTimeoutSecs: 60,

//         handlePageFunction: async ({ request, $ }) => {
//             log.info(`Processing ${request.url}...`);

//             const data = {
//                 country: 'Lithuania',
//                 sourceUrl,
//                 lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
//                 readMe: "https://apify.com/dtrungtin/covid-lt",
//             };
//             const textUls = $('.text > ul');
//             const [confirmed] = $('.text > ul > li:nth-child(1)').text().match(/\d+/);
//             const [t, died] = $('.text > ul > li:nth-child(4)').text().match(/\d+/g);
//             const [tested] = textUls.eq(1).find(' > li:nth-child(2)').text().match(/\d+/);
//             data.confirmedCases = parseInt(confirmed);
//             data.testedCases = parseInt(tested);
//             data.numberOfDeaths = parseInt(died);

//             // Compare and save to history
//             const latest = await kvStore.getValue(LATEST) || {};
//             if (!_.isEqual(_.omit(data, 'lastUpdatedAtApify'), _.omit(latest, 'lastUpdatedAtApify'))) {
//                 await dataset.pushData(data);
//             }

//             await kvStore.setValue(LATEST, data);
//             await Apify.pushData(data);
//         },

//         handleFailedRequestFunction: async ({ request }) => {
//             log.info(`Request ${request.url} failed twice.`);
//         },
//     });

//     await crawler.run();

//     log.info('Crawler finished.');
// });
