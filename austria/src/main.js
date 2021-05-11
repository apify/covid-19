const Apify = require('apify');
const extractNumbers = require('extract-numbers');

const LATEST = 'LATEST';
const parseNum = (str) => {
    return parseInt(extractNumbers(str)[0].replace(/\D+/g, ''), 10);
};
const MAIN_STATS = 'MAIN_STATS';

Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-AUSTRIA');
    const dataset = await Apify.openDataset('COVID-19-AUSTRIA-HISTORY');

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        url: 'https://www.sozialministerium.at/Informationen-zum-Coronavirus/Neuartiges-Coronavirus-(2019-nCov).html',
        userData: {
            label: MAIN_STATS,
        },
    });
    const data = {};

    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        handlePageFunction: async ({ request, $ }) => {
            const { label } = request.userData;

            switch (label) {
                case MAIN_STATS:
                    const table = $('.table-responsive table');
                    const headers = [];
                    let infected;
                    let tested;
                    let deceased;
                    let recovered;
                    let icu;
                    let hospitalized;
                    let lastUpdatedAtSource;
                    $(table).find('thead th').each((index, element) => {
                        headers.push($(element).text().trim());
                    });

                    const processRow = (element) => {
                        const byRegion = [];
                        let total;
                        $(element).find('td').each((index, el) => {
                            const value = parseNum($(el).text());
                            if (index === 9) {
                                total = value;
                            } else {
                                byRegion.push({ name: headers[index + 1], value });
                            }
                        });

                        return { byRegion, total };
                    };
                    $(table).find('tbody tr').each((index, element) => {
                        if (index === 0) {
                            const text = $(element).find('th').text();
                            const dateString = text.split('(Stand ')[1].replace(' Uhr)', '');
                            const split = dateString.split(',');
                            const dateSplit = split[0].split('.');
                            const date = new Date(`${dateSplit[1]}/${dateSplit[0]} /${dateSplit[2]} ${split[1].match(/[0-9:]+/g)[0]}`);
                            lastUpdatedAtSource = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() - 2, date.getMinutes())).toISOString();

                            infected = processRow(element);
                        } else if (index === 1) {
                            deceased = processRow(element);
                        } else if (index === 2) {
                            recovered = processRow(element);
                        } else if (index === 3) {
                            hospitalized = processRow(element);
                        } else if (index === 4) {
                            icu = processRow(element);
                        } else if (index === 5) {
                            tested = processRow(element);
                        }
                    });

                    data.infected = infected.total;
                    data.infectedByRegion = infected.byRegion;
                    data.deceased = deceased.total;
                    data.deceasedByRegion = deceased.byRegion;
                    data.recovered = recovered.total;
                    data.recoveredByRegion = recovered.byRegion;
                    data.tested = tested.total;
                    data.testedByRegion = tested.byRegion;
                    data.totalIcu = icu.total;
                    data.icuByRegion = icu.byRegion;
                    data.totalHospitalized = hospitalized.total;
                    data.hospitalizedByRegion = hospitalized.byRegion;
                    data.country = "Austria";
                    data.historyData = "https://api.apify.com/v2/datasets/EFWZ2Q5JAtC6QDSwV/items?format=json&clean=1";
                    data.sourceUrl = "https://www.sozialministerium.at/Informationen-zum-Coronavirus/Neuartiges-Coronavirus-(2019-nCov).html";
                    data.lastudpatedAtSource = lastUpdatedAtSource;
                    break;
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
