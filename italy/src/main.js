const Apify = require('apify');
const xhr = require('request-promise-native');
const { log } = Apify.utils;

const LATEST = "LATEST";

Apify.main(async () => {
    const store = await Apify.openKeyValueStore('COVID-19-ITALY');
    const dataset = await Apify.openDataset('COVID-19-ITALY-HISTORY');

    const urls = {
        national: 'https://raw.githubusercontent.com/pcm-dpc/COVID-19/master/dati-json/dpc-covid19-ita-andamento-nazionale.json'
    };

    const response = await xhr(urls.national);
    const data = JSON.parse(response);

    const latestData = data[data.length - 1];

    const sourceData =  {
        "hospitalizedWithSymptoms": latestData["ricoverati_con_sintomi"],
        "intensiveTherapy": latestData["terapia_intensiva"],
        "totalHospitalized": latestData["totale_ospedalizzati"],
        "homeInsulation": latestData["isolamento_domiciliare"],
        "totalPositive": latestData["totale_positivi"],
        "newPositive": latestData["nuovi_positivi"],
        "dischargedHealed": latestData["dimessi_guariti"],
        "deceased": latestData["deceduti"],
        "totalCases": latestData["totale_casi"],
        "tamponi": latestData["tamponi"]
    };

    const now = new Date();
    const last = new Date(latestData["data"]);

    const output = {
        ...sourceData,
        sourceUrl: urls.national,
        lastUpdatedAtSource: new Date(latestData["data"]).toISOString(),
        lastUpdatedAtApify: new Date(Date.now()).toISOString(),
        readMe: 'https://apify.com/cyberfly/covid-it'
    };

    // Compare and save to history
    const previousData = await store.getValue(LATEST);
    previousData && delete previousData.lastUpdatedAtApify;
    const currentData = Object.assign({}, output);
    delete currentData.lastUpdatedAtApify;

    if(JSON.stringify(previousData)!== JSON.stringify(currentData)){
        await dataset.pushData(output);
    }

    await store.setValue(LATEST, output);
    await Apify.setValue(LATEST, output);
    await Apify.pushData(output);

    log.info('Done');
});
