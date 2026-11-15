//express contents
//express server

require("dotenv").config();
const express = require("express");
const app = express();

const cookie = require("cookie-parser");
const cookieValidator = require("./cookieValidator");





 const port = 3000;

//middlewares
//app.use(helmet);
//app.use(cors());
//app.use(express.json());
//app.use(express.urlencoded);




 //routing
 //app.METHOD(PATH,HANDLER);

 //GET
 //app.get("/",(req,res)=>{
  //  res.send("welcome in express server");
 //})


 //POST

 //app.post("/login",(req,res)=>{
    //const {username,password} = req.body;


   // if(!username|| password){
    //    res.status(403).json({error: "invalid cridentials"});
  //  }
 //});


 //put
// app.put("/",(req,res)=>{
    //if(user.id){
       // res.status(200).json({message: `user ${userId}updated successifully`})
   // }
 //})


//writing middlewares for use in app


const requestTime = function (req,res,next){
    req.requestTime = Date.now();
    next();
}
app.use(requestTime);


app.get("/",(req,res,next)=>{
    let responseText = "hello there";
    responseText += `<small>requested at : ${req.requestTime}</small>`;
    res.send(responseText)
})

//WE USE COOKIE PARSER TO PARSE INCOMING COOKIES






//validate cookies middleware

async function cokieValidator(cookies) {
      try{
        await externallyValidateCookies(cookies.testCookies);
      }catch{
        throw new Error("invalid cookies");
      }

}


async function validateCookies(req,res,next){
    await cookieValidator(req.cookies);
    next();
}

app.use(cookieParser());
app.use(validateCookies);



//ERROR HANDLER

app.use((err,req,res,next)=>{
    res.status(400).json({erroe: "invalid or expired"});
})




 //start server

 app.listen(port,()=>{
    console.log(`server is running on:http://localhost:${port}`);

 })


