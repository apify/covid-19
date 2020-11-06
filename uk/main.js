const Apify = require('apify');

const LATEST = 'LATEST';

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
                  
        const dailyConfirmed = $( "span:contains(' Daily number of people tested positive')").parent().text();
        const dailyTested = $( "span:contains('Daily number of virus tests ')").parent().text();
        const dailyDeceasedWithin28Days = $( "span:contains('Daily number of deaths within 28 days ')").parent().text();
       
        const data = {
            dailytested: getInt(dailyTested),
            dailyDeceasedWithin28Days: getInt(dailyDeceasedWithin28Days),
            dailyConfirmed: getInt(dailyConfirmed),
            };
        return data;
        
    });       
    

    // getting data about total infected
    await page.goto('https://coronavirus.data.gov.uk/details/cases', { waitUntil: 'networkidle0' });
    await Apify.utils.puppeteer.injectJQuery(page);
    
    await page.waitFor(8000);

    const resultInfected = await page.evaluate(() =>
        {

            const getInt = (x)=>{
                return parseInt(x.replace(' ','').replace(/,/g,''))};
                    
            const totalInfected = $( "a[id*='people_tested_positive-total']").text()
                                
            const data = {
                infected: getInt(totalInfected),
                
                };
            return data;
            
        });     


    result.infected = resultInfected.infected

     // getting data about total tested
     await page.goto('https://coronavirus.data.gov.uk/details/testing', { waitUntil: 'networkidle0' });
     await Apify.utils.puppeteer.injectJQuery(page);
     
     await page.waitFor(8000);
 
     const resultTotalTested = await page.evaluate(() =>
         {
 
             const getInt = (x)=>{
                 return parseInt(x.replace(' ','').replace(/,/g,''))};
                     
             const tested = $( "a[id*='virus_tests_processed-total']").text()
                                 
             const data = {
                tested: getInt(tested),
                 
                 };
             return data;
             
         });     
 
 
     result.tested = resultTotalTested.tested

    // getting data about total deceased
    await page.goto('https://coronavirus.data.gov.uk/details/deaths', { waitUntil: 'networkidle0' });
    await Apify.utils.puppeteer.injectJQuery(page);
    
    await page.waitFor(8000);

    const resultDeceased = await page.evaluate(() =>
        {

            const getInt = (x)=>{
                return parseInt(x.replace(' ','').replace(/,/g,''))};
            const now = new Date();        
            
            const deceased = $( "a[id*='deaths_with_covid-19_on_the_death_certificate-total']").text()
                                
            const data = {
                deceased: getInt(deceased),
                country: "UK",
                historyData: "https://api.apify.com/v2/datasets/K1mXdufnpvr53AFk6/items?format=json&clean=1",
                sourceUrl:'https://coronavirus.data.gov.uk/',
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                lastUpdatedAtSource: $('time').attr("datetime"),
                readMe: 'https://apify.com/katerinahronik/covid-uk',
                
                };
            return data;
            
        });  

    result.deceased = resultDeceased.deceased;
    result.country = resultDeceased.country;
    result.historyData = resultDeceased.historyData;
    result.sourceUrl = resultDeceased.sourceUrl;
    result.lastUpdatedAtApify = resultDeceased.lastUpdatedAtApify;
    result.lastUpdatedAtSource = resultDeceased.lastUpdatedAtSource;
    result.readMe = resultDeceased.readMe

    //console.log(result)
    
    if ( !result.infected || !result.dailyConfirmed || !result.tested) {
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
