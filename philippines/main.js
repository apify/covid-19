const Apify = require('apify');

const sourceUrl = 'https://ncovtracker.doh.gov.ph/';
const LATEST = 'LATEST';
let check = false;

Apify.main(async () =>
{
    const kvStore = await Apify.openKeyValueStore('COVID-19-PH');
    const dataset = await Apify.openDataset('COVID-19-PH-HISTORY');
    const { email } = await Apify.getValue('INPUT');

    try
    {
        
        const now = new Date();

        const sheetsInput = {
        mode: 'read',
        publicSpreadsheet: true,
        spreadsheetId: '1BLbrvgjkBWxr9g73xX9DLOqmbmuYyKc-_b8jIxCX1uo', // update to your ID
        range:"Case Information!H:H"
        };
        const myData = (await Apify.call('lukaskrivka/google-sheets', sheetsInput)).output.body;
        const confirmed = myData.length;
        
        const recovered = myData.filter(x => x.RemovalType =='Recovered').length;
        const deceased = myData.filter(x => x.RemovalType == 'Died').length;    
     
        const result = {
            infected: confirmed,
            tested: "N/A",
            recovered: recovered,
            deceased: deceased,
            //PUIs: getInt(PUIs),
            //PUMs: getInt(PUMs),
            country: "Philippines",
            historyData: "https://api.apify.com/v2/datasets/sFSef5gfYg3soj8mb/items?format=json&clean=1",
            sourceUrl:'https://ncovtracker.doh.gov.ph/',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            lastUpdatedAtSource: "N/A",
            readMe: 'https://apify.com/katerinahronik/covid-philippines',
            };
        
         
        
    
    console.log(result)
    
    if ( !result.infected || !result.deceased|| !result.recovered) {
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
