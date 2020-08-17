const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const sourceUrl = 'https://korona.gov.sk/koronavirus-na-slovensku-v-cislach/';
const LATEST = 'LATEST';

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-SLOVAK-3');
    const dataset = await Apify.openDataset('COVID-19-SLOVAK-3-HISTORY');

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);
    // const statistics = $.find('h3');

    const infected = $('#block_5e9991c460002 > div > h3').text().replace(/\u00a0/g, '');
    const tested = $('#block_5e9990e25ffff > div > h3').text().replace(/\u00a0/g, '');
    const deceased = $('#block_5e9991ed60005 > div > h3').text();
    const recovered = $("#block_5e99921b60008 > div > h3").text().replace(/\u00a0/g, '');

    // find the correct table (to avoid using dynamic selectors, i.e. #block_5e9f669647a94)
    // const table = $('.govuk-grid-column-two-thirds').find(t => t.querySelector('h2') && t.querySelector('h2').innerText === 'Počet pozitívne testovaných za kraje');
    const table = $('#block_5e9f66a347a96 > div > table')

    const regionsData = $(table).find('table > tbody > tr').toArray().map(row => {
        const region = $(row).find('td').eq(0).text().trim();
        const newInfected = $(row).find('td').eq(1).text().trim();
        const totalInfected = $(row).find('td').eq(2).text().trim();
        return { region, newInfected, totalInfected };
    });

    // Or this way:

    // const table = $('.govuk-grid-column-two-thirds').toArray().find(t => $(t).find('h2') && $(t).find('h2').text() === 'Počet pozitívne testovaných za kraje');
    // const tableRows = Array.from($(table).find('table > tbody > tr'));
    // const regionData = [];
    // for (const row of tableRows) {
    //     const cells = Array.from($(row).find('td')).map(td => $(td).text().trim());
    //     regionData.push({
    //         region: cells[0],
    //         increase: cells[1],
    //         overall: cells[2]
    //     });
    // }

    const now = new Date();

    const updated = $('#block_5e9f629147a8d > div > p').text().replace('Aktualizované ', '');

    const result = {
        infected: Number(infected),
        tested: Number(tested),
        recovered: Number(recovered),
        deceased: Number(deceased),
        regionsData,
        updated,
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: 'https://apify.com/davidrychly/covid-sk-3'
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