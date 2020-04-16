const Apify = require('apify');

const sourceUrl = 'https://github.com/BlankerL/DXY-COVID-19-Data/blob/master/json/DXYOverall.json';
const LATEST = 'LATEST';
let check = false;

Apify.main(async () =>
{

    const kvStore = await Apify.openKeyValueStore('COVID-19-CHINA');
    const dataset = await Apify.openDataset('COVID-19-CHINA-HISTORY');
    const { email } = await Apify.getValue('INPUT');


    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();
    
    console.log('Going to the website...');
    await page.goto('https://github.com/BlankerL/DXY-COVID-19-Data/blob/master/json/DXYOverall.json');

    await Apify.utils.puppeteer.injectJQuery(page);
      
    await page.waitForSelector('tbody');
    
    console.log('Getting data...');
    // page.evaluate(pageFunction[, ...args]), pageFunction <function|string> Function to be evaluated in the page context, returns: <Promise<Serializable>> Promise which resolves to the return value of pageFunction
    const result = await page.evaluate(() =>
    {
     
        const now = new Date();
        // text() method sets or returns the text content of the selected elements
                
        const currentConfirmedCount = $('span:contains(currentConfirmedCount)').next().text()
        const confirmedCount = $('span:contains(confirmedCount)').next().text()
        const suspectedCount = $('span:contains(suspectedCount)').next().text()
        const curedCount = $('span:contains(curedCount)').next().text()
        const deadCount = $('span:contains(deadCount)').next().text()
        const seriousCount = $('span:contains(seriousCount)').next().text()

        const data = {
            infected: confirmedCount,
            recovered: curedCount,
            tested: "N/A",
            deceased: deadCount,
            currentConfirmedCount: currentConfirmedCount,
            suspectedCount: suspectedCount,
            seriousCount: seriousCount,
            country: "China",
            historyData: "https://api.apify.com/v2/datasets/LQHrXhGe0EhnCFeei/items?format=json&clean=1",
            sourceUrl:'https://github.com/BlankerL/DXY-COVID-19-Data/blob/master/json/DXYOverall.json',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            lastUpdatedAtSource: "N/A",
            readMe: 'https://apify.com/katerinahronik/covid-china',
            };
        return data;
        
    });       

    console.log(result)
       
    if ( !result.infected ) {
                 check = true;
             }
        
    
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


    console.log('Closing browser...');
    await browser.close();
    console.log('Done.');  
    
    //if there are no data for TotalInfected, send email, because that means something is wrong
    const env = await Apify.getEnv();
    if (check) {
        await Apify.call(
           'apify/send-mail',
            {
                to: email,
                subject: `Covid-19 China from ${env.startedAt} failed `,
                html: `Hi, ${'<br/>'}
                        <a href="https://my.apify.com/actors/${env.actorId}#/runs/${env.actorRunId}">this</a> 
                     run had 0 currentConfirmedCount, check it out.`,
            },
            { waitSecs: 0 },
        );
    };
});
