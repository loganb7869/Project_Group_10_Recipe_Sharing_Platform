import express from "express";
import pg from 'pg';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from "node:url";
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const { Pool } = pg;

/* express and port declaration */
const app = express();
const port = 3000;

// database declaration
const pool = new Pool({
    connectionString: process.env.DATABASE
});

// view engine for ejs 
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// express and bodyparser declaration
app.use(express.urlencoded({ extended: true }));

// middleware
app.use(express.static("public"));

// session middleware
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false
    })
);

// request handlers
app.get("/", (req, res) => {
    res.render("index.ejs", {
        title: "Home Page"
    });
});

// sign up handler
app.get("/signup", (req, res) => {
    res.render("signup.ejs", {
        title: "Sign Up",
        error: null
    });
});

// database check for user
app.post('/signup', async (req, res) => {
    // get user information
    const { user_id, password, name } = req.body;

    try {
        // find if user exists
        const exists = await pool.query('SELECT * FROM users WHERE user_id=$1', [user_id]);

        // if rows are returned
        if (exists.rows.length > 0) {
            // user already exists
            return res.render('signup.ejs', {
                title: "Sign Up",
                error: "User already exists. Sign in or create a new user."
            });
        }

        // add user into database
        await pool.query('INSERT INTO users (user_id, password, name) VALUES ($1,$2,$3)', [user_id, password, name]);

        // go to sign in page
        res.redirect('/signin');
    } catch (err) {
        // return error if creation fails
        console.error(err);
        res.send("Error creating user. Try again later.");
    }
});

// sign out form handler
app.get('/signout', async (req, res) => {
    res.render('signout.ejs', {
        title: "Sign Out",
        error: null
    });
});

// sign the user out
app.post('/signout', async (req, res) => {
    // end the session
    req.session.destroy((err) => {
        // if session ending failed
        if (err) {
            // return error and display to user
            return res.status(500).render('signout', {
                title: "Sign Out",
                error: "There was an error signing out. Try again."
            });
        }

        // redirect to homepage
        res.redirect("/");
    });
});

// signin page handler
app.get('/signin', (req, res) => {
    res.render('signin.ejs', {
        title: "Sign In",
        error: null
    });
});

// sigin post handler
app.post('/signin', async (req, res) => {
    const { user_id, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE user_id=$1 AND password=$2', [user_id, password]);

    if (result.rows.length === 0) {
        return res.render('signin', {
            title: "Sign In",
            error: "Username or password is incorrect."
        });
    }   

    // store session storage variables
    req.session.userId = result.rows[0].user_id;
    req.session.userName = result.rows[0].name;

    // go back to hompeage
    res.redirect("/");
});

// submit recipe handler
app.get("/recipe_submit", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    try {
        // send over information to submission page
        res.render("recipe_submission.ejs", {
            title: "Recipe Submission",
            error: null,
        });

    } catch (err) {
        console.error(err);
        res.send("Error submitting recipe. Try again later.");
    }
});

// submit recipe post request
app.post("/recipe_submit", async (req, res) => {
    // check fif user is signed in
    if (!req.session.userId) {
        return res.redirect("/signin");
    }

    // store information from post request
    const { title, description, instructions, time_to_cook, servings, difficulty, tag, category } = req.body;
    
    // store session user id
    const user_id = req.session.userId;
    
    try {
        // insert recipe into database
        const result = await pool.query('INSERT INTO recipes (user_id, title, description, instructions, time_to_cook, servings, difficulty, dietary_tag, meal_category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING recipe_id', [user_id, title, description, instructions, time_to_cook, servings, difficulty, tag, category]);

        // if database addition failed
        if (result.rowCount !== 1) {
            // return error
            return res.render('recipe_submission', {
                title: "Recipe Submission",
                error: "Submission failed. Try again.",
            });
        }  

        // redirect back to home page
        res.redirect("/");

    } catch (err) {
        // return error if creation fails
        return res.status(500).render('recipe_submission', {
            title: "Recipe Submission",
            error: "There was an error submitting the recipe. Try again.",
        });
    }
});

// view recipe handler
app.get("/view_recipe", (req, res) => {
    res.render("recipe_view.ejs", {
        title: "View Recipe",
        error: null
    });
});

app.get("/preview_submission", (req, res) => {
    res.render("recipe_submission.ejs", {
        title: "Recipe Submission",
        error: null
    });
});

app.get("/view_recipe", (req, res) => {
    res.render("recipe_view.ejs", {
        title: "View Recipe",
        error: null
    });
});

app.get("/saved", (req, res) => {
    res.render("saved_recipes.ejs", {
        title: "Saved Recipes"
    });
});

// handle page not found
app.use((req, res) => {
    res.status(404).send("<h1>Page not found</h1>");
});

// listen on assigned port
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}/`);
});