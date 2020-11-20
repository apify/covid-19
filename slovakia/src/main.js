const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const sourceUrl = 'https://korona.gov.sk/koronavirus-na-slovensku-v-cislach/';
const LATEST = 'LATEST';


const getRegionData = async () => {
    let districts = new Array();
    const myUrl = "https://mapa.covid.chat/map_data";
    const { body } = await httpRequest({ url: myUrl });
    const b = JSON.parse(body);
    const distr = b.districts;
    const distrLength = distr.length;
    for (var i = 0; i < distrLength; i++){
      const town = distr[i].title;
      const newInfected = distr[i].amount.infected_delta;
      const totalInfected = distr[i].amount.infected;
      districts.push({town,newInfected,totalInfected});
  }
    return {districts}
}

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-SLOVAK-3');
    const dataset = await Apify.openDataset('COVID-19-SLOVAK-3-HISTORY');

    const { districts } = await getRegionData();

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);


    const infected = $('#block_5fb76a90e6197 > div > h2').text().replace(/\u00a0/g, '');
    const tested = $('#block_5fb764f549941 > div > h2').text().replace(/\s/g, '');
    const deceased = $('#block_5e9991ed60005 > div > h3').text();
    const recovered = $("#block_5e99921b60008 > div > h3").text().replace(/\u00a0/g, '');
    const newInfected = $('#block_5fb76a90e6199 > div > p').text().replace("Pozitívnych ľudí testovaných PCR Pribudlo: ", '').replace(/\u00a0/g, '');
    const newTested = $('#block_5fb76a90e6197 > div > p').text().replace("Vykonaných PCR testovPribudlo: ", '').replace(/\u00a0/g, '');
    const newDeceased = $('#block_5e9991ed60005 > div > p').text().replace("Úmrtí Pribudlo: ", '').replace(/\u00a0/g, '');
    const newRecovered = $("#block_5e99921b60008 > div > p").text().replace("VyliečenýchpacientovPribudlo: ", '').replace(/\u00a0/g, '');


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
        newInfected: Number(newInfected),
        newTested: Number(newTested),
        newRecovered: Number(newRecovered),
        newDeceased: Number(newDeceased),
        regionsData,
        districts: districts,
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
