const Apify = require('apify');
const cheerio = require("cheerio");
const moment = require('moment');
const { log } = Apify.utils;

const LATEST = "LATEST";

const toNumber = (str) => parseInt(str.replace(/\D/g, ""));

Apify.main(async () => {
    const sourceUrl = "http://covid.gov.pk";
    const store = await Apify.openKeyValueStore('COVID-19-PAKISTAN');
    const dataset = await Apify.openDataset('COVID-19-PAKISTAN-HISTORY');

    const response = await Apify.utils.requestAsBrowser({
        url: sourceUrl,
        proxyUrl: Apify.getApifyProxyUrl({
            // country: 'US'
            groups: [
                'SHADER'
            ]
        })
    });

    const $ = await cheerio.load(response.body);

    log.info('Processing and saving data...');

    const infected = $('.diagnosed-icon').next().next().text().replace(',','');
    const tested = $('.active-icon').next().next().text().replace(',','').replace(',','');
    const recovered = $('.recovered-icon').next().next().text().replace(',','');
    const deceased = $('.deaths-icon').next().next().text().replace(',','');
    const critical = $('.tests-icon').next().next().text().replace(',','');

    const lastLocalString = $("#last-update").text().trim();
    const lastLocalMoment = moment(lastLocalString, 'DD MMMM, YYYY - hh:mm');
    const lastUpdatedAtSource = new Date(`${lastLocalMoment.toDate()} GMT+5`).toISOString();

    const sourceData = {
        infected: Number(infected),
        tested: Number(tested),
        recovered: Number(recovered),
        deceased: Number(deceased),
        critical: Number(critical)
    };

    const output = {
        ...sourceData,
        sourceUrl,
        lastUpdatedAtSource,
        lastUpdatedAtApify: new Date(Date.now()).toISOString(),
        readMe: 'https://apify.com/cyberfly/covid-pk'
    };

    console.log({output});

    // Compare and save to history
    const previousData = await store.getValue(LATEST);
    previousData && delete previousData.lastUpdatedAtApify;
    const currentData = Object.assign({}, output);
    delete currentData.lastUpdatedAtApify;

    if (JSON.stringify(previousData) !== JSON.stringify(currentData)) {
        await dataset.pushData(output);
    }

    await store.setValue(LATEST, output);
    await Apify.setValue(LATEST, output);
    await Apify.pushData(output);

    log.info('Done');
});
