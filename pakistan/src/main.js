const Apify = require('apify');
const cheerio = require("cheerio");
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
    
    // const lastLocal = $("#last-update")
    //     .text()
    //     .trim()
    //     .split(':')[1]
    //     .split('- ')
    //     .map((input, index) =>
    //         index ?
    //             input.replace(/[a-z]+/g, ` ${input.match(/[a-z]+/)}`) :
    //             input)
    //     .join('')
    //     .replace(/\s+/g, ' ');
    // const dateLocal = new Date(`${lastLocal} GMT+5`);
    // const lastUpdatedAtSource = new Date(dateLocal.setHours(dateLocal.getHours() - 5)).toISOString();

    const sourceData = {
        infected: Number(infected),
        tested: Number(tested),
        recovered: Number(recovered),
        deceased: Number(deceased),
        critical: Number(critical)
    };

    console.log(sourceData);

    const output = {
        ...sourceData,
        sourceUrl,
        // lastUpdatedAtSource: new Date(dateLocal).toISOString(),
        lastUpdatedAtApify: new Date(Date.now()).toISOString(),
        readMe: 'https://apify.com/cyberfly/covid-pk'
    };

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
