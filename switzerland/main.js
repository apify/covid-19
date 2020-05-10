// main.js
const Apify = require('apify');
const XLSX = require('xlsx')
const { log } = Apify.utils;

const LATEST = "LATEST";
const now = new Date();
const sourceUrl = 'https://www.bag.admin.ch/bag/en/home/krankheiten/ausbrueche-epidemien-pandemien/aktuelle-ausbrueche-epidemien/novel-cov/situation-schweiz-und-international.html';

Apify.main(async () => {

    log.info('Starting actor.');

    const kvStore = await Apify.openKeyValueStore("COVID-19-SWITZERLAND");
    const dataset = await Apify.openDataset("COVID-19-SWITZERLAND-HISTORY");

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        url: sourceUrl,
        userData: {
            label: 'GET_XLSX_LINK'
        }
    })

    log.debug('Setting up crawler.');
    const cheerioCrawler = new Apify.CheerioCrawler({
        requestQueue,
        maxRequestRetries: 5,
        requestTimeoutSecs: 60,
        useApifyProxy: true,
        additionalMimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'],
        prepareRequestFunction: async ({ request }) => {
            if (request.url.endsWith('.xlsx')) {
                log.info(`Proccecing ${request.url}`)
                log.info(`Downloading xlsx file ...`)
            };
        },
        handlePageFunction: async ({ request, $, body }) => {
            const { label } = request.userData;
            switch (label) {
                case 'GET_XLSX_LINK':
                    log.info(`Proccecing ${request.url}`)
                    log.info(`Getting xlsx download link.`)
                    const $xlsxLink = $('a[title="French"][href*=".xlsx"]').attr('href');
                    await requestQueue.addRequest({
                        url: `https://www.bag.admin.ch${$xlsxLink}`,
                        userData: {
                            label: 'EXTRACT_DATA'
                        }
                    })
                    break;
                case 'EXTRACT_DATA':
                    log.info(`File had downloaded.`);
                    log.info(`Processing and saving data.`);
                    let workbook = XLSX.read(body, { type: "buffer" });

                    const { CreatedDate } = workbook.Props;
                    const atSource = new Date(CreatedDate)

                    const { __EMPTY: newlyInfected, __EMPTY_1: infected, __EMPTY_2: newlyHospitalized
                        , __EMPTY_3: hospitalized, __EMPTY_4: newlyDeceased, __EMPTY_5: deceased } =
                        XLSX.utils.sheet_to_json(workbook.Sheets['COVID19 chiffres']).pop();

                    const data = {
                        infected, tested: 'N/A', recovered: 'N/A', deceased, hospitalized,
                        newlyInfected, newlyHospitalized, newlyDeceased
                    }

                    const infectedByRegion = []
                    const casesByRegion = XLSX.utils.sheet_to_json(workbook.Sheets['COVID19 cas par canton'])

                    for (const value of casesByRegion) {
                        const [region, infected, incidence] = Object.values(value);
                        if (/^[A-Z]{2}$/.test(region)) {
                            infectedByRegion.push({
                                region, infected, incidence
                            })
                        }
                    }
                    data.infectedByRegion = infectedByRegion;
                    data.country = 'Switzerland';
                    data.historyData = 'https://api.apify.com/v2/datasets/73pVXuygDYAtIMOhI/items?format=json&clean=1';
                    data.sourceUrl = sourceUrl;
                    data.lastUpdatedAtApify = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();
                    data.lastUpdatedAtSource = new Date(Date.UTC(atSource.getFullYear(), atSource.getMonth(), atSource.getDate(), (atSource.getHours()), atSource.getMinutes())).toISOString();
                    data.readMe = 'https://apify.com/dtrungtin/covid-ch';

                    // Push the data
                    let latest = await kvStore.getValue(LATEST);
                    if (!latest) {
                        await kvStore.setValue('LATEST', data);
                        latest = Object.assign({}, data);
                    }
                    delete latest.lastUpdatedAtApify;
                    const actual = Object.assign({}, data);
                    delete actual.lastUpdatedAtApify;

                    const { itemCount } = await dataset.getInfo();
                    if (JSON.stringify(latest) !== JSON.stringify(actual) || itemCount === 0) {
                        await dataset.pushData(data);
                    }

                    await kvStore.setValue('LATEST', data);
                    await Apify.pushData(data);

                    log.info('Data saved.');
                    break;
                default:
                    break;
            }

        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed many times.`);
            console.dir(request)
        },
    });
    // Run the crawler and wait for it to finish.
    log.info('Starting the crawl.');
    await cheerioCrawler.run();
    log.info('Actor finished.');
});