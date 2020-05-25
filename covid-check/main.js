const Apify = require('apify');
​
// Just loading the files here. You could download them with http request or just copy them both
// This isn't really an important part
const json1 = require('https://api.apify.com/v2/key-value-stores/SmuuI0oebnTWjRTUh/records/LATEST?disableRedirect=true');
const json2 = require('https://api.apify.com/v2/key-value-stores/tVaYRsPHLjNdNBu7S/records/LATEST?disableRedirect=true');
​
Apify.main(async () => {
    // First file is array with JSON with another array of JSONs inside, so let's just take that inner array
    const arr1 = json1[0].regionData;
    // Second file is array with JSONs straight away, let's use it as-is
    const arr2 = json2;
​
    // let's create an array of keys from both files, i.e. France, Italy, Germany
    const keys1 = arr1.map(e => e.country);
    const keys2 = arr2.map(e => e.country);
    // let's join two arrays and remove duplicates by creating a set (thus leaving only unique values)
    const keys = [...new Set(keys1.concat(keys2))];
​
    // we'll assign the values here
    const result = {};
​
    // for each key (country from the set we created)
    for (const key of keys) {
        result[key] = {}; // created an object first with a selected key
        const arr1item = arr1.find(item => item.country === key); // try to find respective entry in first file
        const arr2item = arr2.find(item => item.country === key); // try to find respective entry in second file
        // now let's save the found values (if found, otherwise null)
        result[key].totalCases = arr1item ? arr1item.totalCases : null;
        result[key].infected = arr2item ? arr2item.infected : null;
    }
​
    // let's iterate through each key and save the deviation if entry was present in both files 
    for (const key of Object.keys(result)) {
        if (result[key].totalCases && result[key].infected) {
            // that's just a rough calculation - difference vs one of the values 
            result[key].deviation = ((result[key].totalCases - result[key].infected) / result[key].infected * 100).toFixed(2) + '%';
        } else {
            // or just null
            result[key].deviation = null;
        }
    }
    
    // that's it, let's save the file
    await Apify.setValue('result', result);
});