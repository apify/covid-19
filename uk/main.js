const Apify = require('apify');

const sourceUrl = 'https://coronavirus.data.gov.uk/';
const LATEST = 'LATEST';
let check = false;

Apify.main(async () =>
{

    const kvStore = await Apify.openKeyValueStore('COVID-19-UK');
    const dataset = await Apify.openDataset('COVID-19-UK-HISTORY');
    const { email } = await Apify.getValue('INPUT');

    try{

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();
   

    console.log('Going to the website...');
    await page.goto('https://coronavirus.data.gov.uk/', { waitUntil: 'networkidle0' });
    await Apify.utils.puppeteer.injectJQuery(page);
    
    await page.waitFor(4000);
    
    console.log('Getting data...');
    // page.evaluate(pageFunction[, ...args]), pageFunction <function|string> Function to be evaluated in the page context, returns: <Promise<Serializable>> Promise which resolves to the return value of pageFunction
    const result = await page.evaluate(() =>
    {

        const getInt = (x)=>{
            return parseInt(x.replace(' ','').replace(/,/g,''))};
            
        const now = new Date();
        
        // eq() selector selects an element with a specific index number, text() method sets or returns the text content of the selected elements
        const totalInfected = $( "a[id*='cases-total']" ).text().trim();
        const dailyConfirmed = $( "a[id*='cases-daily']" ).text().trim();
        // //const patientsRecovered = $("text[vector-effect='non-scaling-stroke']").eq(4).text();
        const deceased = $( "a[id*='deaths-total']" ).text().trim();
        const tested = $( "a[id*='testing-total']" ).text().trim();
        // const englandConfirmed = $('td:contains("England")').next().eq(0).text().trim();
        // const englandDeceased = $('h3:contains("England").govuk-caption-m').next().text().trim();
        // const scotlandConfirmed = $('td:contains("Scotland")').next().eq(0).text().trim();
        // const scotlandDeceased = $('h3:contains("Scotland").govuk-caption-m').next().text().trim();
        // const walesConfirmed =$('td:contains("Wales")').next().eq(0).text().trim();
        // const walesDeceased = $('h3:contains("Wales").govuk-caption-m').next().text().trim();
        // const irelandConfirmed = $('td:contains("Northern Ireland")').next().eq(0).text().trim();
        // const irelandDeceased = $('h3:contains("Northern Ireland").govuk-caption-m').next().text().trim();
               
        const data = {
            infected: getInt(totalInfected.substring(0, totalInfected.indexOf('Value'))),
            tested: getInt(tested.substring(0, tested.indexOf('Value'))),
            // recovered: "N/A",
            deceased: getInt(deceased.substring(0, deceased.indexOf('Value'))),
            dailyConfirmed: getInt(dailyConfirmed.substring(0, dailyConfirmed.indexOf('Value'))),
            // englandConfirmed: getInt(englandConfirmed),
            // englandDeceased: getInt(englandDeceased),
            // scotlandConfirmed: getInt(scotlandConfirmed),
            // scotlandDeceased: getInt(scotlandDeceased),
            // walesConfirmed: getInt(walesConfirmed),
            // walesDeceased: getInt(walesDeceased),
            // northenIrelandConfirmed: getInt(irelandConfirmed),
            // northenIrelandDeceased: getInt(irelandDeceased),
            country: "UK",
            historyData: "https://api.apify.com/v2/datasets/K1mXdufnpvr53AFk6/items?format=json&clean=1",
            sourceUrl:'https://coronavirus.data.gov.uk/',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            lastUpdatedAtSource: $('time').attr("datetime"),
            readMe: 'https://apify.com/katerinahronik/covid-uk',
            };
        return data;
        
    });       
    
    console.log(result)
    
    if ( !result.infected || !result.dailyConfirmed || !result.deceased || !result.tested) {
                throw "One of the output is null";
            }
    else {
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


    console.log('Closing Puppeteer...');
    await browser.close();
    console.log('Done.');  
    
}
catch(err){

    console.log(err)

    let latest = await kvStore.getValue(LATEST);
    var latestKvs = latest.lastUpdatedAtApify;
    var latestKvsDate = new Date(latestKvs)
    var d = new Date();
    // adding two hours to d
    d.setHours(d.getHours() - 2);
    if (latestKvsDate < d) {
        throw (err)
    }
}
});
