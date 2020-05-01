const Apify = require('apify');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const csvjson = require('csvjson');

const sourceUrl = 'https://ncovtracker.doh.gov.ph/';
const LATEST = 'LATEST';
let check = false;

async function selectorExists(page, selector)
        {
            return await page.evaluate((selector) =>
            {
                
                if ($(selector).text() == '')
                    return false;
                return true;
            }, selector);
                        
        }

Apify.main(async () =>
{
    const kvStore = await Apify.openKeyValueStore('COVID-19-PH');
    const dataset = await Apify.openDataset('COVID-19-PH-HISTORY');
    
    try
    {
        //getting date string
        let actualDateString = new moment().format('YYYYMMDD');
        let actualSelector = `div:contains(DOH COVID Data Drop_ ${actualDateString})[jsaction*=click]`;
        const yesterdaySelector = `div:contains(DOH COVID Data Drop_ ${new moment().subtract(1, 'days').format('YYYYMMDD')})[jsaction*=click]`;    

        console.log('Launching Puppeteer...');
        const browser = await Apify.launchPuppeteer({ headless: false });
        const page = await browser.newPage();
        // the source url (html page source) link to this page

         console.log('Going to the website...');
        await page.goto('https://drive.google.com/drive/folders/1PEJZur082d2oLp9ZWaBfp1sj5WIlVBRI', { timeout: 60000, waitUntil: 'networkidle0' });
        await Apify.utils.puppeteer.injectJQuery(page);
        await page.waitFor(1000);
        
        //try actual date, if no selector for today, then yesterday
        if (! await selectorExists(page, actualSelector))
        {
            actualSelector = yesterdaySelector;
            //actualDateString = new moment().add(1, 'days').format('YYYYMMDD');
        }
        
        await Promise.all([
            page.evaluate((actualSelector) =>
            {
                return $(actualSelector).click();
            }, actualSelector),

            page.waitForNavigation({ waitUntil: 'networkidle0' })]);

        await page.waitFor(1000);

        await Promise.all([
            page.evaluate(() =>
            {
                return $('div:contains(Case Information.csv)[jsaction*=click]').click();
            }),
            page.waitForNavigation({ waitUntil: 'networkidle0' })]);


        // path where am I plus downloaded

        console.log('Downloading csv...')
        const dwnPath = path.resolve(__dirname, 'downloaded');

        //if directory dont exists, create it
        if (!fs.existsSync(dwnPath))
        {
            fs.mkdirSync(dwnPath);
        }

        //to be sure delete all files in it
        let files = fs.readdirSync(dwnPath);
        files.forEach(x => fs.unlinkSync(path.join(dwnPath, x)));
        
        // set download path for a browser
        await page._client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dwnPath });
        
        
        let downloadButtonSelector = 'div[data-tooltip=Download]';
             
        //click for downloading the file
        await page.click(downloadButtonSelector);

        //wait for downloading
        await page.waitFor(3000);

        //we dont know the filename, but it should be the only file in the directory (because they keep changing the list number)
        files = fs.readdirSync(dwnPath);
    
        const filePath = path.join(dwnPath, files[0]);
        
        const fileContent = fs.readFileSync(filePath, 'utf-8')
        const myData = csvjson.toObject(fileContent);

        console.log('Getting data...')
        const confirmed = myData.length;
        const recovered = myData.filter(x => x.RemovalType == 'Recovered').length;
        const deceased = myData.filter(x => x.RemovalType == 'Died').length;

        const now = new Date();
    
        const result = {
            infected: confirmed,
            tested: "N/A",
            recovered: recovered,
            deceased: deceased,
            //PUIs: getInt(PUIs),
            //PUMs: getInt(PUMs),
            country: "Philippines",
            historyData: "https://api.apify.com/v2/datasets/sFSef5gfYg3soj8mb/items?format=json&clean=1",
            sourceUrl: 'https://ncovtracker.doh.gov.ph/',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            lastUpdatedAtSource: "N/A",
            readMe: 'https://apify.com/katerinahronik/covid-philippines',
        };
              
        console.log(result)
    
        if (!result.infected || !result.deceased || !result.recovered)
        {
            throw "One of the output is null";
        }
        else
        {
            let latest = await kvStore.getValue(LATEST);
            if (!latest)
            {
                await kvStore.setValue('LATEST', result);
                latest = result;
            }
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, result);
            delete actual.lastUpdatedAtApify;

            if (JSON.stringify(latest) !== JSON.stringify(actual))
            {
                await dataset.pushData(result);
            }

            await kvStore.setValue('LATEST', result);
            await Apify.pushData(result);
        }


        console.log('Closing Puppeteer...');
        await browser.close();
        console.log('Done.');   

    }
    catch (err)
    {

        console.log(err)

        let latest = await kvStore.getValue(LATEST);
        var latestKvs = latest.lastUpdatedAtApify;
        var latestKvsDate = new Date(latestKvs)
        var d = new Date();
        // adding two hours to d
        d.setHours(d.getHours() - 2);
        if (latestKvsDate < d)
        {
            throw (err)
        }
    }
});
