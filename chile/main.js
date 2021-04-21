const Apify = require('apify');

const { utils: { log } } = Apify;
const now = new Date();

Apify.main(async () => {
    const requestList = await Apify.openRequestList('start-urls', [{
        url: 'https://www.minsal.cl/nuevo-coronavirus-2019-ncov/casos-confirmados-en-chile-covid-19/'
    }]);
    const requestQueue = await Apify.openRequestQueue();
    const dataset = await Apify.openDataset('COVID-19-CL-HISTORY');
    const kvStore = await Apify.openKeyValueStore('COVID-19-CL');

    const crawler = new Apify.CheerioCrawler({
        requestList,
        requestQueue,
        maxConcurrency: 50,
        handlePageFunction: async (context) => {
            const regions = [];
            const { $ } = context;
            const table = $('tbody').first().find('tr');
            $(table).each((i, e) => {
                let dataTr = [];
                let region = {
                    name: '',
                    infected: '',
                    totalDailyInfected: '',
                    dailyAsymptomaticInfected: '',
                    dailySymptomaticInfected: '',
                    dailyInfectedWithoutNotification: '',
                    activeConfirmedInfected: '',
                    deceased: '',
                    recovered: '',

                }
                if (i > 1) {
                    $(e).find('span').each((ind, elem) => {
                        dataTr.push($(elem).text())
                    })
                    let looper = 0;
                    for (const property in region) {
                        if (property === 'name') {
                            region[property] = dataTr[looper];
                        } else {
                            region[property] = Number(dataTr[looper].split('.').join(""));
                        }

                        looper += 1;
                    }
                    regions.push(region);
                }
            });

            let nationalReport = regions[regions.length - 1];
            const [d, m, y] = $('#main > div.post > div.texto > div > table:nth-child(5) > tbody > tr:nth-child(3) > td:nth-child(1) > h5')
                .text()
                .split('Reporte Diario COVID-19').pop().trim().split('-');
            const srcDate = new Date(`${'21:00'} ${m}-${d}-${y}`);

            regions.pop();
            delete nationalReport.name;
            nationalReport.tested = 'N/A';
            nationalReport.country = 'Chile';
            nationalReport.regions = regions;
            nationalReport.lastUpdatedAtSource = new Date(Date.UTC(srcDate.getFullYear(), srcDate.getMonth(), srcDate.getDate(), (srcDate.getHours()), srcDate.getMinutes())).toISOString()
            nationalReport.lastUpdatedAtApify = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();
            nationalReport.historyData = 'https://api.apify.com/v2/datasets/Dc7asb1F0Ic19PPWg/items?format=json&clean=1';
            nationalReport.sourceUrl = 'https://www.minsal.cl/nuevo-coronavirus-2019-ncov/casos-confirmados-en-chile-covid-19/';
            nationalReport.README = '';

            //Save data
            let latest = await kvStore.getValue('LATEST');
            if (!latest) {
                await kvStore.setValue('LATEST', nationalReport);
                latest = Object.assign({}, nationalReport);
            }
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, nationalReport);
            delete actual.lastUpdatedAtApify;

            const { itemCount } = await dataset.getInfo();
            if (JSON.stringify(latest) !== JSON.stringify(actual) || itemCount === 0) {
                await dataset.pushData(nationalReport);
            }

            await kvStore.setValue('LATEST', nationalReport);
            await Apify.pushData(nationalReport);

            log.info('Data saved.');
        },
    });

    log.info('Starting the crawl.');
    await crawler.run();
    log.info('Crawl finished.');
});


