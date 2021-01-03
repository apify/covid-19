const Apify = require('apify');
const latinize = require('latinize');
const { log } = Apify.utils;
const sourceUrl = 'https://www.gov.pl/web/koronawirus/wykaz-zarazen-koronawirusem-sars-cov-2';
const LATEST = 'LATEST';
let check = false;
Apify.main(async () => {
    const { email } = await Apify.getValue('INPUT');
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-POLAND');
    const dataset = await Apify.openDataset('COVID-19-POLAND-HISTORY');
    await requestQueue.addRequest({ url: sourceUrl });
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useApifyProxy: true,
        apifyProxyGroups: ['CZECH_LUMINATI'],
        handlePageTimeoutSecs: 60 * 2,
        handlePageFunction: async ({ $ }) => {
            log.info('Page loaded.');
            const now = new Date();
            const rawData = JSON.parse(latinize($('pre#registerData').text().trim()));
            const countryData = JSON.parse(rawData.parsedData);
            log.info(`${countryData.length} regions loaded.`);
            const infectedByRegion = [];
            let infectedCountTotal = 0;
            let deceasedCountTotal = 0;
            if (countryData.length === 0) {
                check = true;
            }
            for (const region of countryData) {
                const regionName = region.Wojewodztwo;
                const city = region['Powiat/Miasto'];
                const infectedCount = region.Liczba ? parseInt(region.Liczba.replace(/ /g, '')) : 0;
                const deceasedCount = region['Wszystkie przypadki smiertelne'] ? parseInt(region['Wszystkie przypadki smiertelne'].replace(/ /g, '')) : 0;
                infectedByRegion.push({
                        region: regionName,
                        city,
                        infectedCount,
                        deceasedCount,
                });
            }

            const infected = $('.global-stats dl dt:contains(Liczba zakażonych od początku pandemii:)').next().text();
            const deceased = $('.global-stats dl dt:contains(Liczba przypadków śmiertelnych:)').next().text();

            const data = {
                infected: parseInt(infected),
                deceased: parseInt(deceased),
                infectedByRegion,
                sourceUrl,
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                readMe: 'https://apify.com/vaclavrut/covid-pl',
            };

            console.log(data);
            // Compare and save to history
            const latest = await kvStore.getValue(LATEST);
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, data);
            delete actual.lastUpdatedAtApify;
            if (JSON.stringify(latest) !== JSON.stringify(actual)) {
                log.info('Data did change :( storing new to dataset.');
                await dataset.pushData(data);
            }
            await kvStore.setValue(LATEST, data);
            log.info('Data stored, finished.');
            // to have lovely public runs...
            await Apify.pushData(data);
        },
        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });
    // Run the crawler and wait for it to finish.
    await crawler.run();
    console.log('Crawler finished.');
    // if there are no region data, send email, because that means something is wrong
    const env = await Apify.getEnv();
    if (check) {
        await Apify.call(
            'apify/send-mail',
            {
                to: email,
                subject: `Covid-19 PL from ${env.startedAt} failed `,
                html: `Hi, ${'<br/>'}
                        <a href="https://my.apify.com/actors/${env.actorId}#/runs/${env.actorRunId}">this</a> 
                        run had 0 regions, check it out.`,
            },
            { waitSecs: 0 },
        );
    }
});