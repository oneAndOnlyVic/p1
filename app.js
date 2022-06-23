const express = require('express')
const app = express();

const _ = require('lodash')

const mongoose = require('mongoose')
const ejs = require('ejs')

const passport = require('passport')
const LocalStrategy = require('passport-local')

const bcrypt = require('bcryptjs');

const session = require('express-session');



app.set('view engine','ejs')

app.use(express.urlencoded({extended:true}))
app.use(express.static('public'))

app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
}));
app.use(passport.initialize())
app.use(passport.session())


passport.serializeUser(function(user, done) {
    done(null, user.id); 
   // where is this user.id going? Are we supposed to access this anywhere?
  });
  
  // used to deserialize the user
  passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
        done(err, user);
    });
  });

passport.use(new LocalStrategy(
    function(username, password, done) {
      User.findOne({ username: username }, function (err, user) {
        if (err) { console.log(err); return done(err); }
        if (!user) { console.log('user empty'); return done(null, false); }
        // if (!user.verifyPassword(password)) { return done(null, false); }
 
        if(user){
            bcrypt.compare(password,user.password,(err,result)=>{
                if(result === true){
                    return done(null, user);
                }
                else{
                    return done(null, false)
                }
            })
        }
        return done(null, user);
      });
    }
  ));

mongoose.connect('mongodb://localhost:27017/libDB')
 .then(()=>{console.log('connected')})
 .catch(()=>{console.log('an error occured')}) 


const bookSchema =  mongoose.Schema({
    name:String,
    author:String,
    year:String,
    description:String
})

const bookRequestSchema = mongoose.Schema({
    userId:String,
    bookName:String,
    bookId:String,
    status : Boolean
})

const userSchema = mongoose.Schema({
    username : String,
    password : String,
    type     : String,
    canBorrow : [String],
    borrowed : [String],
    bookRequests : [bookRequestSchema]
})

const Book = mongoose.model('book',bookSchema)
const User = mongoose.model('user',userSchema)


app.get('/',(req,res)=>{
  res.send('yeah the home page')
})

app.get('/books',(req,res)=>{
    Book.find({},(err,arr)=>{
        res.send(arr);
    })
})

app.listen('3000',()=>{
    console.log('app is running on port 3000')
})

app.get('/logIn',(req,res)=>{
   res.render('signUp')
})

app.get('/signUp',(req,res)=>{
   res.render('signUp')
})

app.get('/books/:book',(req,res)=>{
    let requestedBook = req.params.book
    const reg = new RegExp(`${requestedBook}`,'i') //case insensitive regex
    const ID  = mongoose.Types.ObjectId(req.user.id)
    if(req.isAuthenticated() && req.user.type !== "admin"){
        User.findOne({"_id":ID,"borrowed":reg},(err,userHasBook)=>{
            console.log(userHasBook)
            if(userHasBook !== null){
                Book.findOne({"name":reg},(err,book)=>{
                    res.send(book)
                })
            }
            else{
                res.send("you haven't borrowed this book,or you dont have access to it")
            }
        })
    }
})

app.post('/signUp',(req,res)=>{
    let name = req.body.username
    let passwordToRegister = req.body.password
    
    bcrypt.genSalt(10, function(err, salt) {
        if(!err){
            bcrypt.hash(passwordToRegister, salt, function(err, hash) {
                User.create({username:name,password:hash}).then((person)=>{
                  res.redirect('/signIn')
                })
            });
        }
        else{
            console.log(err)
        }
    });

})

app.get('/signIn',(req,res)=>{
    res.render('signIn')
})

app.post('/signIn',passport.authenticate('local'),(req,res)=>{
    try{
        if(req.user.type === 'admin'){
            res.redirect('/signIn/admin')
        }
        else{
            res.redirect('/signIn/profile')
        }
    }
    catch(error){
        console.error(error)
    }
    
})

app.get('/signIn/profile',(req,res)=>{
    if(req.isAuthenticated()){
        User.findById(req.user.id,{bookRequests:1,borrowed:1,canBorrow:1},(err,requestsToAdmin)=>{
           Book.find({},(err,allBooks)=>{

            //  console.log(requestsToAdmin)
             res.render('profile',{requests:requestsToAdmin.bookRequests,books:allBooks,borrowedBooks:requestsToAdmin.borrowed,canBorrow:requestsToAdmin.canBorrow})
           }) 
            
            // console.log(result)
        })
    }
    else{
        res.send('you do not have access to this page')
    }
})

app.post('/signIn/profile/request',(req,res)=>{
   if(req.isAuthenticated() && req.user.type !== 'admin'){
        const bookrequest = {
            bookName : req.body.bookname,
            userId   : req.user.id
        }

        //creating regex that will be used to check if a request for this book has 
        //already been made or if the book is already availlable for borrow
        let reg = new RegExp(`${req.body.bookname}`,'i')
        let ID = mongoose.Types.ObjectId(req.user.id) 
        let userCanBorrow = false; //bool for checking if user can already borrow a particular requested book
        let bookReg = new RegExp(`${req.body.bookname}`,'i') //this regex will be used to check if the inputed book exists in the database
        let bookExitsInDatabase = false
        
        Book.findOne({"name": bookReg},(err,book)=>{
            if(book !== null){
                bookExitsInDatabase = true
                console.log(book)
            }

            if(bookExitsInDatabase){
                User.find({$and : [{"bookRequests.bookName" : {$regex : reg}},{"_id":ID}]},(err,result)=>{
               
                
    
                    if(result.length > 0){
                        console.log('this request is on already')
                        res.redirect('/signIn/profile')
                    }
                    else{
                        User.findOne({"_id":ID},(err,result)=>{
                            
                            if(result.canBorrow.length === 0){
                                User.updateOne({type:'admin'},{$push  : {bookRequests : bookrequest}},(err)=>{
                                    //push this request to request list of admin
                                    User.findByIdAndUpdate(req.user.id,{ $push : {bookRequests : bookrequest}},(err)=>{
                                        //push thi request to request array of admin
                                        console.log('done')
                                        res.redirect('/signIn/profile')
                                    })
                                })
                            }
                            else{
                                result.canBorrow.forEach((element,indx) => {
                                    if(element.match(reg)){
                                        userCanBorrow = true; //turn this bool to true if user can already borrow book
                                     }
                                     
                                    if(indx === result.canBorrow.length-1){
                                       
                                        if(userCanBorrow){
                                          console.log('exists in can borrow list, you can go ahead and borrow this book')
                                          res.redirect('/signIn/profile')
                                        }
                                        else
                                        {
                                          User.updateOne({type:'admin'},{$push  : {bookRequests : bookrequest}},(err)=>{
                                              //push this request to request list of admin
                                              User.findByIdAndUpdate(req.user.id,{ $push : {bookRequests : bookrequest}},(err)=>{
                                                  //push thi request to request array of admin
                                                  console.log('done')
                                                  res.redirect('/signIn/profile')
                                              })
                                          })
                                        }
                                      }
                                });
                            }
                          
                        })
        
                        
                    }
                 })
            }
            else
            {
                console.log('their is no book with this name in our database')
                res.redirect('/sigIn/profile')
            }
        })

        
    }
})

app.post('/signIn/profile/borrow',(req,res)=>{
    const bookName = req.query.book
    const ID = mongoose.Types.ObjectId(req.user.id)
    const bookCanBeBorrowed = false
    
    let reg = new RegExp(`${bookName}`,'i')
    User.findOne({"_id":ID,"canBorrow":reg},(err,haveBookInCanBorrowList)=>{ //check if the book can be borrowed
        if(haveBookInCanBorrowList === null){
            console.log('unfortunatlly you do not have acess to borrow this book. kindly submit a request to yours trully')
            res.redirect('/signIn/profile')
        }
        else{

            User.findOne({"_id":ID,"borrowed":reg},(err,havebookInBorrowedList)=>{
               if(havebookInBorrowedList === null){
                //meanining user has not already borrowed book
                  User.updateOne({"_id":ID},{$push : {"borrowed":bookName}},(err,addedBooktoBorrowedList)=>{
                   
                    res.redirect('/signIn/profile')
                  })
               }
               else{
                    console.log('you have already borrowed this book')
                    
                    res.redirect('/signIn/profile')
               }
            })

        }
        // console.log(result)
        
    })
})

app.get('/signIn/admin',(req,res)=>{
    if(req.isAuthenticated() && req.user.type === "admin"){
            // User.find({},{bookRequests : 1},(err,arr)=>{
            //     arr.forEach(ele =>{
            //         console.log(ele)
            //     })
            // })
            User.findOne({type:"admin"},(err,result)=>{
             res.render('admin',{requests:result.bookRequests})
            })
            
        }
        else{
        res.redirect('/books')
       }
})

app.post('/signIn/admin/bookrequests',(req,res)=>{
    //request to admin here
})

app.post('/signIn/admin',(req,res)=>{
    // res.send('yeah')
    const userId = req.query.userId
    const bookName = req.query.book
    let objectId = mongoose.Types.ObjectId(userId)

    if(req.isAuthenticated() && req.user.type === "admin"){
        // console.log(req.query)

      User.updateOne({"_id":objectId},{$pull : {"bookRequests":{"userId": userId , "bookName":bookName}}},(err,result)=>{
        //removing the book request entry from the respective user; console.log(result,err)
         User.updateOne({"type":"admin"},{$pull : {"bookRequests":{"userId": userId , "bookName":bookName}}},(err,result)=>{
            //remove the respective request from admin request array
            User.updateOne({"_id":objectId},{$push : {"canBorrow":bookName}},()=>{
                //add the book to can borrow list of the user
                res.redirect('/signIn/admin')
            })
     
         })
      })
    }
})