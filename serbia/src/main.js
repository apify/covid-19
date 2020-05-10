const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const sourceUrl = 'https://covid19.rs/homepage-english/';
const LATEST = 'LATEST';

Apify.main(async () => {
  const kvStore = await Apify.openKeyValueStore('COVID-19-SERBIA');
  const dataset = await Apify.openDataset('COVID-19-SERBIA-HISTORY');

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);
    const infected = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-6f98bbd0.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-59e8c78f.elementor-column.elementor-col-33.elementor-inner-column > div > div > div.elementor-element.elementor-element-c11c81c.elementor-widget.elementor-widget-heading > div > p').text()
    const tested = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-53a7df09.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-68c970ce.elementor-widget.elementor-widget-heading > div > p').text()
    const recovered = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-12cd577.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-0d2a255.elementor-widget.elementor-widget-heading > div > p').text()
    const deceased = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-6f98bbd0.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-571da723.elementor-column.elementor-col-33.elementor-inner-column > div > div > div.elementor-element.elementor-element-b99363d.elementor-widget.elementor-widget-heading > div > p').text()
    const hospitalised = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-77e49a92.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-88a6746.elementor-widget.elementor-widget-heading > div > p').text()
    const tested24hours = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-2f543d91.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-7bba3929.elementor-widget.elementor-widget-heading > div > p').text()
    const infected24hours = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-608ab178.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-37b7aa3c.elementor-widget.elementor-widget-heading > div > p').text()
    const deceased24hours = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-67a58fd.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-aa6dae2.elementor-widget.elementor-widget-heading > div > p').text()

const toInt = (string) => Number(string.replace('.', ''))

    const now = new Date();

    const result = {
        infected: toInt(infected),
        recovered: toInt(recovered),
        deceased: toInt(deceased),
        tested: toInt(tested),
        hospitalised: toInt(hospitalised),
        tested24hours: toInt(tested24hours),
        infected24hours: toInt(infected24hours),
        deceased24hours: toInt(deceased24hours),
        sourceUrl: 'https://covid19.rs/homepage-english/',
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: 'https://github.com/zpelechova/covid-ps/blob/master/README.md'
    };
    console.log(data)

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

// I could rewrite the original actor but was able to write a new one, so I commented the old one below:


// // This is the main Node.js source code file of your actor.

// // Include Apify SDK. For more information, see https://sdk.apify.com/
// const Apify = require('apify');

// Apify.main(async () => {
//     // Get input of the actor (here only for demonstration purposes).
//     const input = await Apify.getInput();
//     console.log('Input:');
//     console.dir(input);

//     // Create and initialize an instance of the RequestList class that contains
//     // a list of URLs to crawl. Here we use just a few hard-coded URLs.
//     const requestList = new Apify.RequestList({
//         sources: [
//             { url: 'https://covid19.rs/homepage-english/' },
//         ],
//     });
//     await requestList.initialize();
//     const kvStore = await Apify.openKeyValueStore('COVID-19-SERBIA');
//     const dataset = await Apify.openDataset('COVID-19-SERBIA-HISTORY');

//     // Create an instance of the CheerioCrawler class - a crawler
//     // that automatically loads the URLs and parses their HTML using the cheerio library.
//     const crawler = new Apify.CheerioCrawler({
//         // Let the crawler fetch URLs from our list.
//         requestList,

//         // The crawler downloads and processes the web pages in parallel, with a concurrency
//         // automatically managed based on the available system memory and CPU (see AutoscaledPool class).
//         // Here we define some hard limits for the concurrency.
//         minConcurrency: 10,
//         maxConcurrency: 50,

//         // On error, retry each page at most once.
//         maxRequestRetries: 1,

//         // Increase the timeout for processing of each page.
//         handlePageTimeoutSecs: 60,

//         // This function will be called for each URL to crawl.
//         handlePageFunction: async ({ request, body, $ }) => {
//             console.log(`Processing ${request.url}...`);
            
//             // Extract data from the page using cheerio.
//             var data = {};
//             data.sourceUrl = request.url;
//             data.lastUpdatedAtApify = new Date();
//             data.readMe = "https://apify.com/krakorj/covid-serbia";

//             // Source title
//             const sourceTitle = $('title').text();
//             data.sourceTitle = sourceTitle;
            
//             // Source text is the first info article in page
//             var src = $('#main');
//             console.log(src.text());

//             // Timestamp of the last article
//             var date = src.text();
//             var rex = /.*?updated.*?(?<day>\d+)\.(?<month>\d+)\.(?<year>\d+).*?(?<hours>\d+):(?<minutes>\d+)/g;
//             var match = rex.exec(date);
//             if (match != null) {
//                 date = match.groups.year + "-" + match.groups.month + "-" + match.groups.day + 
//                     "T" + match.groups.hours + ":" + match.groups.minutes + ":00Z";
//                 data.lastUpdatedAtSource = new Date(date);
//                 console.log("Info date: " + date);
//             }
            
//             // Tested cases
//             //console.log(src.text());
//             rex = /.*?Torlak\s+Institute\s+tested\s+(?<testedCasesTotal>[\d]+)/s
//             match = rex.exec(src.text());
//             if (match != null)
//                 data.testedCasesTotal = match.groups.testedCasesTotal
//                     .replace(/[\s\.]/g,"");

//             // Infected
//             //console.log(src.text());
//             rex = /.*?there are.*?(?<infectedTotal>[\d\s\.]+)[^\d]*?positive case/s
//             match = rex.exec(src.text());
//             if (match != null)
//                 data.infectedTotal = match.groups.infectedTotal
//                     .replace(/[\s\.]/g,"");
            
//             // Recovered
//             //console.log(src.text());
//             rex = /.*?(?<recoveredTotal>[\d\s\.]+)[^\d]*?recovered/s
//             match = rex.exec(src.text());
//             if (match != null)
//                 data.recoveredTotal = match.groups.recoveredTotal
//                     .replace(/[\s\.]/g,"");
            
//             // Deadths
//             //console.log(src.text());
//             rex = /.*?(?<deathsTotal>[\d\s\.]+)[^\d]*?death/s
//             match = rex.exec(src.text());
//             if (match != null)
//                 data.deathsTotal = match.groups.deathsTotal
//                     .replace(/[\s\.]/g,"");
//             else {
//                 data.deathsTotal = "0";
//             }

//             console.log(data);

//             // Store the results to the default dataset. In local configuration,
//             // the data will be stored as JSON files in ./apify_storage/datasets/default
//             await Apify.pushData(data);

//             // OUTPUT update
//             console.log('Setting OUTPUT...')
//             await Apify.setValue('OUTPUT', data);

//             // Key-value store / data set update
//             console.log('Setting LATEST...')
//             let latest = await kvStore.getValue('LATEST');
//             if (!latest) {
//                 await kvStore.setValue('LATEST', data);
//                 latest = data;
//                 await dataset.pushData(data);
//             }
//             else {
//                 var latestUpdateTimestamp = new Date(latest.lastUpdatedAtSource);
//                 if (latestUpdateTimestamp.getTime() != data.lastUpdatedAtSource.getTime()) {
//                     await dataset.pushData(data);
//                 }
//             }
            
//             await kvStore.setValue('LATEST', data);

//             // Done :)
//             console.log('Finished');
//         },

//         // This function is called if the page processing failed more than maxRequestRetries+1 times.
//         handleFailedRequestFunction: async ({ request }) => {
//             console.log(`Request ${request.url} failed twice.`);
//         },
//     });

//     await crawler.run();

    

//     console.log('Crawler finished.'); 
// });

    
