const Apify = require('apify');

const sourceUrl = 'https://raw.githubusercontent.com/BlankerL/DXY-COVID-19-Data/master/json/DXYOverall.json';
const LATEST = 'LATEST';
let check = false;

Apify.main(async () =>
{

    const kvStore = await Apify.openKeyValueStore('COVID-19-CHINA');
    const dataset = await Apify.openDataset('COVID-19-CHINA-HISTORY');
    //const { email } = await Apify.getValue('INPUT');

    const bodyResponse = (await Apify.utils.requestAsBrowser({ url: sourceUrl })).body;
    const jsonStats = JSON.parse(bodyResponse).results[0];

    const now = new Date();
    const result = {
        infected: jsonStats.confirmedCount,
        recovered: jsonStats.curedCount,
        tested: "N/A",
        deceased: jsonStats.deadCount,
        currentConfirmedCount: jsonStats.currentConfirmedCount,
        suspectedCount: jsonStats.suspectedCount,
        seriousCount: jsonStats.seriousCount,
        country: "China",
        historyData: "https://api.apify.com/v2/datasets/LQHrXhGe0EhnCFeei/items?format=json&clean=1",
        sourceUrl:'https://github.com/BlankerL/DXY-COVID-19-Data/blob/master/json/DXYOverall.json',
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        lastUpdatedAtSource: "N/A",
        readMe: 'https://apify.com/katerinahronik/covid-china',
        };    
       
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
