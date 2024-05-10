const AWS = require('aws-sdk');
const axios = require('axios');

const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();

exports.handler = async(event) => {
    try {
        // Get the S3 bucket name and object key from the event
        const bucket = event.Records[0].s3.bucket.name;
        const filename = event.Records[0].s3.object.key
        const objectKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

        // Call the facial analysis function to get labels for the uploaded image
        const rekognitionParams = {
            Image: {
                S3Object: {
                    Bucket: bucket,
                    Name: objectKey
                }
            },
            Attributes: [
                "ALL"
            ]
        };
        const response = await rekognition.detectFaces(rekognitionParams).promise();

        // Collect all face details and put in one sentence.
        let facedetails = ""
        const age = Math.floor((response.FaceDetails[0].AgeRange.Low+response.FaceDetails[0].AgeRange.High) /2)

        facedetails += age+" years old, ";

        if (response.FaceDetails[0].Sunglasses.Value){
            facedetails += "using sunglasses, ";
        }
        const gender = response.FaceDetails[0].Gender.Value;
        facedetails += "gender is "+gender+", " ;
        if (response.FaceDetails[0].Beard.Value){
            facedetails += "with beard, ";
        }
        if (response.FaceDetails[0].Mustache.Value){
            facedetails += "with mustache, ";
        }
        const emotion = response.FaceDetails[0].Emotions[0].Type;
        facedetails += "and emotion is "+emotion;
        // Call the OpenAI API to generate articles based on the selected face details
        const openaiEndpoint = 'https://api.openai.com/v1/engines/gpt-3.5-turbo-instruct/completions';
        const openaiApiKey = process.env.OPEN_API_KEY; // Replace with your OpenAI API key

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + openaiApiKey
        };
        const data = {
            prompt: "Create a shorts story without a title with the following face details: " + facedetails,
            max_tokens: 500
        };

        const openaiResponseArticle = await axios.post(openaiEndpoint, data, { headers });
        const openaiResultArticle = openaiResponseArticle.data;
        const articles = openaiResultArticle.choices[0].text;

        const dataTitle = {
            prompt: "create a title for this story: " + articles,
            max_tokens: 100
        };
        let openaiResponseTitle = await axios.post(openaiEndpoint, dataTitle, { headers });
        let openaiResultTitle = openaiResponseTitle.data;
        let title = openaiResultTitle.choices[0].text;
        
        const jsonData = {
            "title": title,
            "article": articles
        };
        // Store the generated article in a new S3 bucket
        const resultBucket = bucket;
        //const resultKey = `${selectedNode}-article.txt`; 
        const resultKey = `articles/${filename}-article.json`; //sa folder na article, yung filename ay yung naupload na filename din

        await s3.putObject({
            Bucket: resultBucket,
            Key: resultKey,
            Body: JSON.stringify(jsonData)
        }).promise();

        // Return the URL of the generated article stored in S3
        //after magresponse ng fileupload, kailngan ulit ng http request para kunin ung laman ng url na ito
        const articleUrl = `https://s3.amazonaws.com/${resultBucket}/${filename}`; 
        

        return {
            statusCode: 200,
            body: JSON.stringify({ articleUrl: articleUrl })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};
