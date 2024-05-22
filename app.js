//jshint esversion:6
require('dotenv').config();
const express = require("express");
const { ObjectId } = require('mongoose').Types;
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require('express-session');
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const multer = require('multer')
const path = require('path')
const port = 3000;
const app = express();


app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: "Our little secret.",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/lmsDB");



const userSchema = new mongoose.Schema ({
  googleId: String,
  fName: String,
  lName: String,
  username: String,
  password: String,
  photo:{path:String},
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  isLocked: { type: Boolean, default: false },
});



const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads'); // Directory where uploaded files will be stored
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname)); // Use unique filename
  }
});

// Initialize multer upload middleware
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 5 } // Limit file size to 5MB
});



const roleSchema = new mongoose.Schema({
  name:String
})



const leaveSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateOfApplication:{ type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  reason: { type: String, required: true },
  leaveType:{ type: String, required: true },
  status:{ type: String,default: 'Pending' },
 
});


const leaveTypeSchema = new mongoose.Schema({

})


userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);




const User = new mongoose.model("User", userSchema);
const Role = new mongoose.model('Role',roleSchema)
const Leave = new mongoose.model('Leave',leaveSchema)





passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(async function(id, done) {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});


passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(profile);

    User.findOrCreate({ googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));


app.get("/auth/google",
  passport.authenticate('google', { scope: ["profile"] })
);

app.get("/auth/google/secrets",
  passport.authenticate('google', { failureRedirect: "/login" }),
  function(req, res) {
    // Successful authentication, redirect to secrets.
    res.redirect("/secrets");
  });

app.get("/login", function(req, res){
  res.render("login");
});

app.get("/register", function(req, res){
  res.render("registration");
});

app.get("/", function(req, res){

  if (req.isAuthenticated()){
    
    User.findById(req.user.id)
        .then(user=>{

                const path = user.photo.path;

                // Function to remove 'public' prefix
                function removePublicPrefix(filePath) {
                    const prefix = 'public/';
                    if (filePath.startsWith(prefix)) {
                        return filePath.slice(prefix.length);
                    }
                    return filePath; // Return the original path if it doesn't start with 'public/'
                }

                const newPath = removePublicPrefix(path);
          Leave.find({user:req.user.id})
                
                .then(leaves=>{

                      User.find({})
                          .then(users=>{
                            
                            res.render('home',{leaves:leaves,users:users,path:newPath})
                          })

                          .catch(err=>{
                            console.log(err)
                          })
                })
                .catch(err=>{
                  console.log(err)
                })

          
          
        })
        .catch(err=>{
          console.log(err)
        })


    
  } else {
    res.redirect("/login");
  }

  
});




app.get("/logout", function(req, res){
  req.logout(function(err) {
    if (err) {
      // Handle error
      console.error(err);
      return res.redirect("/"); // Redirect to home page
    }
    // If logout was successful, redirect to home page
    res.redirect("/login");
  });
});


app.post("/register", async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  const fName = req.body.lName;
  const lName = req.body.fName;
  try {
    const existingUser = await User.findOne({ username: email });

    if (existingUser) {
      return res.send("The account already exists!");
    }

    const newUser = new User({ username: email, fName:fName,lName:lName});
    await User.register(newUser, password);

    // Authenticate the user after successful registration
    req.login(newUser, (err) => {
      if (err) {
        console.log(err);
        return res.send("An error occurred while logging in. Please try again later.");
      }

      req.session.save((error) => {
        if (error) {
          console.log(error);
          return res.send("An error occurred while logging in. Please try again later.");
        } else {
          res.redirect("/");
        }
      });
    });
  } catch (error) {
    console.log(error);
    res.send("An error occurred. Please try again later.");
  }
});



app.post("/login", function(req, res, next) {
  User.findOne({username:req.body.username})
     
      .then(user=>{
        
        if(user.isLocked){

          res.redirect('/login')

        }
        else{
              passport.authenticate("local", function(err, user, info) {
                if (err) {
                  console.error(err);
                  return res.send("An error occurred while logging in. Please try again later.");
                }
                if (!user) {
                  console.log("User not found");
                  return res.redirect("/login"); // Authentication failed, redirect back to login page
                }
                req.login(user, function(err) {
                  if (err) {
                    console.error(err);
                    return res.send("An error occurred while logging in. Please try again later.");
                  }
                  // console.log("User logged in:", user);
                  return res.redirect("/"); // Authentication successful, redirect to home page
                });
              })(req, res, next);
          
        }
      })
      .catch(err=>{
        console.log(err)
      })

});


app.get('/user/manage-users',(req,res)=>{

  if (req.isAuthenticated()){
   
    User.find({})
    .then(users => {
      Role.find({})
            .then(roles=>{
              res.render('manageUsers', { users: users,roles:roles });
            })
      
    })
    .catch(err => {
      console.error(err);
      // Handle the error appropriately
    });

  }
  else{
    res.redirect('/login')
  }
 

})


function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role.equals(new ObjectId('66473598427af38f33135c42'))) {
    return next();
  } else {
    res.redirect('/login');
  }
}



app.get('/admin', isAdmin, async (req, res) => {
  try {
    const [users, roles, leaves, pendingLeaves, acceptedLeaves, rejectedLeaves] = await Promise.all([
      User.find({}).exec(),
      Role.find({}).exec(),
      Leave.find({}).exec(),
      Leave.find({ status: 'PENDING' }).exec(),
      Leave.find({ status: 'APPROVED' }).exec(),
      Leave.find({ status: 'REJECTED' }).exec()
    ]);

    const numberOfUsers = users.length;
    const numberOfRoles = roles.length;
    const numberOfLeaves = leaves.length;
    const numberOfPending = pendingLeaves.length;
    const numberOfAccepted = acceptedLeaves.length;
    const numberOfRejected = rejectedLeaves.length;

    res.render('index', {
      numberOfRoles,
      numberOfUsers,
      numberOfLeaves,
      numberOfPending,
      numberOfAccepted,
      numberOfRejected
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});




app.get('/user/manage-leaves',(req,res)=>{
    Leave.find({})
          .then(leaves=>{

           User.find({})
                .then(users=>{
                  console.log(users)
                  res.render('manageLeaves',{leaves:leaves,users:users})
                })

                .catch(err=>{
                  console.log(err)
                })
          })
          .catch(err=>{
            console.log(err)
          })

    
})

app.post('/user/manage-leaves/accept/:url',(req,res)=>{
    const url = req.params.url
    console.log(url,)
    Leave.updateOne({_id:url},{$set:{status:'APPROVED'}})
          .then(leave=>{
            console.log('Leave approved')

            res.redirect('/user/manage-leaves')

          })
          .catch(err=>{
            console.log(err)
          })

})


app.post('/user/manage-leaves/reject/:url',(req,res)=>{
  const url = req.params.url
  console.log(url,)
  Leave.updateOne({_id:url},{$set:{status:'REJECTED'}})
        .then(leave=>{
          console.log('Leave rejected')
          res.redirect('/user/manage-leaves')
        })
        .catch(err=>{
          console.log(err)
        })

})


app.route('/user/apply-leave')
    .get((req,res)=>{
        if(req.isAuthenticated()){
          res.render('applyLeave')
        }
        else{
          res.redirect('/login')
        }
        
    })
    .post((req,res)=>{
          
          
          function getCurrentDateFormatted() {
            const date = new Date();
        
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
            const day = String(date.getDate()).padStart(2, '0');
        
            return `${day}-${month}-${year}`;
            
          }
          const applyDate = getCurrentDateFormatted()
          

          function formatDate(dateString) {
            // Create a Date object from the input string
            const date = new Date(dateString);
        
            // Get the day, month, and year components
            const day = String(date.getDate()).padStart(2, '0'); // Get the day and pad with a leading zero if necessary
            const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based, so add 1 and pad with a leading zero
            const year = date.getFullYear(); // Get the full year
        
            // Return the formatted date string
            return `${day}-${month}-${year}`;
        }
          const fromDate = formatDate(req.body.fromDate)
          const endDate = formatDate(req.body.EndDate)
          console.log(fromDate,endDate)
          const leave = new Leave({
              user: req.user.id,
              dateOfApplication:applyDate,
              startDate: fromDate,
              endDate: endDate,
              reason:req.body.reason,
              leaveType:req.body.leaveType,
              status: req.body.status,
            
          }) 

          Leave.findOne({user:req.user.id})
                .then(foundLeave=>{
                  if(foundLeave){
                            if(foundLeave.status != "PENDING"){
                              leave.save()
                              console.log('leave submited ')
                              res.redirect('/user/manage-leaves')
                            }
                
                            else{
                              
                              console.log('can not log any other leave')
                              res.redirect('/user/apply-leave')
                            }
                }
                  else{
                    leave.save()
                    console.log('leave submited ')
                    res.redirect('/user/manage-leaves')
                  }
                  
                 
                })
                .catch(err=>{
                  console.log(err)
                })

    });
    

app.get('/user/my-leaves',(req,res)=>{
    res.render('myLeaves')
})

app.route('/role/manage')
  .get((req,res)=>{

    Role.find({})
      .then(roles=>{
        res.render('roles',{roles:roles})
      })
      .catch(err=>{
          res.status(400).send('Bad request')
      })
      
    }) 

    .post((req,res)=>{
     
      res.redirect('/role/manage')
    });

app.route('/role/add')
    .get((req,res)=>{
      res.render('add-role')
    })
    .post((req, res) => {
      const roleName = req.body.role;
  
      Role.findOne({ name: roleName })
          .then(role => {
              if (role) {
                  console.log('Role already exists');
                  res.redirect('/role/add');
              } else {
                  const newRole = new Role({
                      name: roleName
                  });
                  newRole.save()
                      .then(() => {
                          res.redirect('/role/manage');
                      })
                      .catch(err => {
                          console.log(err);
                          res.status(500).send('Internal Server Error');
                      });
              }
          })
          .catch(err => {
              console.log(err);
              res.status(500).send('Internal Server Error');
          });
  });
  
app.route('/role/edit/:url')
  .get((req,res)=>{
    
    Role.findById(req.params.url)
        .then(role=>{
          if(role){
            res.render('editRole',{role:role.name,id:req.params.url})
          }
          else{
            res.redirect('/role/manage')
          }
          
        })
   
  
  })
  .post((req,res)=>{
    
    Role.updateOne({_id:req.params.url},{$set:{name:req.body.role}})
        .then(role=>{
          if(role){
            res.redirect('/role/manage')
          }
          else{
            res.redirect('/role/edit')
          }

        })
        .catch(err=>{
          console.log(err)
        })
   
  
  })

app.get('/user/change-password',(req,res)=>{
    res.render('changePassword')
})

app.route('/manage-users/edit/:url')
    .get((req,res)=>{
      const url = req.params.url
      if (req.isAuthenticated()){
       const user =  req.user

      User.findById(url)
          .then(user=>{

              Role.find({})
              .then(roles=>{
                
                res.render('editUser',{user:user,roles:roles})
              })
              .catch(err=>{
                console.log(err)
              })

          })
          .catch(err=>{
            console.log(err)
          })

      }
      else{
        res.redirect('/login')
      } 
    })
    .post(upload.single('photo'),(req,res)=>{
      const id = req.user.id
      const fName = req.body.fName;
      const lName = req.body.lName;
      const photoPath = req.file ? req.file.path : null; 
      const role = req.body.role
      console.log(photoPath,role)
      User.updateOne({_id:id},{$set:{fName:fName,lName:lName,'photo.path':photoPath,role:role}})
          .then(user=>{
            
            console.log('user updated successfully')
            res.redirect('/user/manage-users')
          })
          .catch(err=>{
            console.log('Could not update the user')
          })
        
    })







app.post('/manage-users/block',(req,res)=>{
  User.updateOne({_id:req.body.block},{$set:{isLocked:true}})
          .then(user=>{
            
            console.log('user locked successfully')
            res.redirect('/login')
          })
          .catch(err=>{
            console.log('Could not update the user')
          })
 
})


app.post('/manage-users/unlock',(req,res)=>{
  User.updateOne({_id:req.body.unlock},{$set:{isLocked:false}})
          .then(user=>{
            
            console.log('user unlocked successfully')
            res.redirect('/login')
          })
          .catch(err=>{
            console.log('Could not update the user')
          })
 
})

app.post('/manage-roles/delete',(req,res)=>{
  console.log(req.body.role)
  Role.deleteOne({_id:req.body.role})
      .then(role=>{

        console.log(`Role ${role.name} deleted sucessfully`)
        res.redirect('/role/manage')
      })
      .catch(err=>{
        console.log(err)
      })
})

app.use((req, res, next) => {
  req.setTimeout(2 * 60 * 1000); // 2 minutes
  next();
});



app.listen(port,(req,res)=>{
    console.log('App running on port:'+port)
})