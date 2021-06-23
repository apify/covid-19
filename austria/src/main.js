const Apify = require('apify');
const extractNumbers = require('extract-numbers');

const LATEST = 'LATEST';
const parseNum = (str) => {
    return parseInt(extractNumbers(str)[0].replace(/\D+/g, ''), 10);
};
const COVID_DATA = 'COVID_DATA';

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-AUSTRIA');
    const dataset = await Apify.openDataset('COVID-19-AUSTRIA-HISTORY');

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        // url: 'https://www.sozialministerium.at/Informationen-zum-Coronavirus/Neuartiges-Coronavirus-(2019-nCov).html',
        url: 'https://covid19-dashboard.ages.at/data/JsonData.json',
        userData: {
            label: COVID_DATA,
        },
    });
    const data = {};

    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        handlePageFunction: async ({ request, json, $ }) => {
            const { label } = request.userData;

            switch (label) {
                case COVID_DATA: {
                    const { TestGesamt: tested, Meldedatum: date } = json.KETDaten.last();
                    const sourceDate = new Date(date);
                    const {
                        AnzahlFaelleSum: infected, AnzahlGeheiltSum: recovered, AnzahlTotSum: deceased
                    } = json.CovidFaelle_Timeline.last();

                    const {
                        FZHosp: totalHospitalized, FZICU: totalIcu, FZHospFree: availbleHospitalBeds, FZICUFree: availbleIcuBeds
                    } = json.CovidFallzahlen.last();

                    const infectedByRegion = {};
                    for (const record of json.CovidFaelle_Timeline) {
                        const { Bundesland: region, AnzahlFaelleSum: infected, AnzahlGeheiltSum: recovered, AnzahlTotSum: deceased } = record;
                        if (region === "Österreich") continue;
                        infectedByRegion[region] = {
                            region,
                            infected,
                            recovered,
                            deceased,
                            active: infected - recovered - deceased
                        }
                    }

                    data.tested = tested;
                    data.infected = infected;
                    data.recovered = recovered;
                    data.deceased = deceased;
                    data.active = infected - recovered - deceased;
                    data.infectedByRegion = Object.values(infectedByRegion).map(value => value);
                    data.totalHospitalized = totalHospitalized;
                    data.totalIcu = totalIcu;
                    data.availbleHospitalBeds = availbleHospitalBeds;
                    data.availbleIcuBeds = availbleIcuBeds;
                    // data.deceasedByRegion = deceased.byRegion;
                    // data.recoveredByRegion = recovered.byRegion;
                    // data.testedByRegion = tested.byRegion;
                    // data.icuByRegion = icu.byRegion;
                    // data.hospitalizedByRegion = hospitalized.byRegion;
                    data.country = "Austria";
                    data.historyData = "https://api.apify.com/v2/datasets/EFWZ2Q5JAtC6QDSwV/items?format=json&clean=1";
                    data.sourceUrl = "https://www.sozialministerium.at/Informationen-zum-Coronavirus/Neuartiges-Coronavirus-(2019-nCov).html";
                    data.lastudpatedAtSource = new Date(
                        Date.UTC(
                            sourceDate.getFullYear(),
                            sourceDate.getMonth(),
                            sourceDate.getDate(),
                            sourceDate.getHours(),
                            sourceDate.getMinutes()
                        )
                    ).toISOString();
                    break;
                }
                default:
                    break;
            }
        },
        handleFailedRequestFunction: async ({ request }) => {
            await Apify.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },
    });
    await crawler.run();
    const now = new Date();
    data.lastUpdatedAtApify = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();

    console.log(data);

    let latest = await kvStore.getValue(LATEST);
    if (!latest) {
        await kvStore.setValue('LATEST', data);
        latest = data;
    }
    delete latest.lastUpdatedAtApify;
    const actual = Object.assign({}, data);
    delete actual.lastUpdatedAtApify;

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(data);
    }

    await kvStore.setValue('LATEST', data);
    await Apify.pushData(data);

    console.log('Done.');
});

Array.prototype.last = function () {
    return this[this.length - 1];
}