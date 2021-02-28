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
    // Delete and replace the same values of Bratislava and Košice
    districts.splice(5,4);
    districts.splice(20,3);
    districts[4].town= "Bratislava";
    districts[19].town= "Košice";

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);

    const infectedPCR = $('#block_6037862491b9a > div > p').text().replace(/[^0-9]/g, '');
    const infectedAG = $("#block_60378c0bc4f85 > div > p").text().replace(/[^0-9]/g, '');
    const testedAG = $("#block_60378ba2c4f83 > div > p").text().replace(/[^0-9]/g, '');
    const testedPCR = $('#block_603780b691b98 > div > p').text().replace(/[^0-9]/g, '');
    const deceased = $('#block_60378d5bc4f89 > div > p').text().replace(/[^0-9]/g, '');
    const recovered = $("#block_5e99921b60008 > div > h3").text().replace(/\u00a0/g, ''); // No longer available
    const newInfectedPCR = $('#block_6037862491b9a > div > h2').text().replace(/[^0-9]/g, '');
    const newTestedPCR = $('#block_603780b691b98 > div > h2').text().replace(/[^0-9]/g, '');
    const newDeceased = $('#block_60378d5bc4f89 > div > h2').text().replace(/[^0-9]/g, '');
    const newRecovered = $("#block_5e99921b60008 > div > p").text().replace(/[^0-9]/g, ''); // No longer available
    const newInfectedAG = $("#block_60378c0bc4f85 > div > h2").text().replace(/[^0-9]/g, '');
    const newTestedAG = $('#block_60378ba2c4f83 > div > h2').text().replace(/[^0-9]/g, '');
    const vacinatedFirstDose = $("#block_60379179c4f8b > div > p").text().replace(/[^0-9]/g, '');
    const newVacinatedFirstDose = $("#block_60379179c4f8b > div > h2").text().replace(/[^0-9]/g, '');
    const vacinatedSecondDose = $("#block_603791edc4f8d > div > p").text().replace(/[^0-9]/g, '');
    const newVacinatedSecondDose = $("#block_603791edc4f8d > div > h2").text().replace(/[^0-9]/g, '');
    const hospitalized = $("#block_60378c91c4f87 > div > p").text().replace(/[^0-9]/g, '');
    const newHospitalized = $("#block_60378c91c4f87 > div > h2").text().replace(/[^0-9]/g, '');


    // Find the correct table (to avoid using dynamic selectors, i.e. #block_5e9f669647a94)
    const table = $('#block_5e9f66a347a96 > div > table')

    const regionsData = $(table).find('table > tbody > tr').toArray().map(row => {
        const region = $(row).find('td').eq(0).text().trim();
        const newInfected = parseInt($(row).find('td').eq(1).text().replace(/\s/g, '').trim());
        const totalInfected = parseInt($(row).find('td').eq(2).text().replace(/\s/g, '').trim());
        return { region, newInfected, totalInfected };
    });

    const now = new Date();

    const updated = $('#block_5e9f629147a8d > div > p').text().replace('Aktualizované ', '');

    const result = {
        tested: Number(testedPCR),
        infected: Number(infectedPCR),
        recovered: Number(recovered),
        deceased: Number(deceased),
        infectedPCR: Number(infectedPCR),
        testedPCR: Number(testedPCR),
        newInfectedPCR: Number(newInfectedPCR),
        newTestedPCR: Number(newTestedPCR),
        infectedAG: Number(infectedAG),
        testedAG: Number(testedAG),
        newInfectedAG: Number(newInfectedAG),
        newTestedAG: Number(newTestedAG),
        newRecovered: Number(newRecovered),
        newDeceased: Number(newDeceased),
        vacinatedFirstDose: Number(vacinatedFirstDose),
        newVacinatedFirstDose: Number(newVacinatedFirstDose),
        vacinatedSecondDose: Number(vacinatedSecondDose),
        newVacinatedSecondDose: Number(newVacinatedSecondDose),
        hospitalized: Number(hospitalized),
        newHospitalized: Number(newHospitalized),
        regionsData,
        districts,
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
