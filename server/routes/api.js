'use strict';

const boom = require('boom');
const bcrypt = require('bcrypt-as-promised');
const jwt = require('jsonwebtoken');
const knex = require('../../knex');
const router = require('express').Router();


router.get('/', (req, res) => {
  res.send('Hi from API!');
})

/*
  ------------------------------------------------------------------------------
  User Registration and Authentication
  ------------------------------------------------------------------------------
*/

// Register 1 User
router.post('/users', (req, res, next) => {
  const { username, email, password, address } = req.body;

  bcrypt.hash(password, 12)
    .then((h_pw) => {
      return knex('users').insert({ username: username, email: email, h_pw: h_pw, address: address }, '*');
    })
    .then((users) => {
      const user = users[0];

      const claim = { userId: user.id };
      const token = jwt.sign(claim, process.env.JWT_KEY, {
        expiresIn: '30 days'
      });

      user.token = token;

      delete user.h_pw;

      res.send(user);
    })
    .catch((err) => {
      next(err);
    });
});

router.post('/token', (req, res, next) => {
  let user;

  const { email, password } = req.body;
  console.log(email, password);

  knex('users')
    .where('email', email)
    .first()
    .then((row) => {
      if (!row) {
        throw boom.create(400, 'Bad email or password');
      }

      user = row;
      console.log(user);

      return bcrypt.compare(password, user.h_pw);
    })
    .then(() => {
      const claim = { userId: user.id };
      const token = jwt.sign(claim, process.env.JWT_KEY, {
        expiresIn: '30 days'
      });

      // res.cookie('token', token, {
      //   httpOnly: true,
      //   expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      //   secure: router.get('env') === 'production'
      // });

      user.token = token;

      delete user.h_pw;

      res.send(user);
    })
    .catch(bcrypt.MISMATCH_ERROR, () => {
      throw boom.create(400, 'Bad email or password');
    })
    .catch((err) => {
      next(err);
    });
});

/*
  ------------------------------------------------------------------------------
  Markers
  ------------------------------------------------------------------------------
*/


const getVerifications = function(problem) {
  const probId = problem.id;
  let yes;
  let no;

  const promise = new Promise((resolve, reject) => {
    knex('verifications')
    .count('verified as yes')
    .where('prob_id', probId)
    .where('verified', true)
    .returning('*')
    .then((yesVerification) => {
      const yesCount = yesVerification[0];

      yes = parseInt(yesCount.yes);

      return knex('verifications')
      .count('verified as no')
      .where('prob_id', probId)
      .where('verified', false)
      .returning('*')
    })
    .then((noVerification) => {
      const noCount = noVerification[0];

      no = parseInt(noCount.no);

      const total = no + yes;
      problem.no = no;
      problem.yes = yes;
      problem.total = total;
      // const verified = { no, yes, total };

      resolve(problem)
    })
  })
  return promise;
}

router.post('/markers', (req, res, next) => {
  console.log(req.body.lat);
  const { lat, lng } = req.body;

  const lat1 = parseFloat(lat) + 0.2;
  const lat2 = parseFloat(lat) - 0.2;

  const lng1 = parseFloat(lng) + 0.2;
  const lng2 = parseFloat(lng) - 0.2;

  knex('problems')
    .select(
      'problems.id as id',
      'problems.user_id as userId',
      'problems.title as title',
      'problems.description as description',
      'problems.lat as lat',
      'problems.lng as lng',
      'users.username as username',
      'categories.category as category')
    .innerJoin('categories', 'categories.id', 'problems.category_id')
    .innerJoin('users', 'users.id', 'problems.user_id')
    .whereBetween('problems.lat', [Math.min(lat1, lat2), Math.max(lat1, lat2)])
    .whereBetween('problems.lng', [Math.min(lng1, lng2), Math.max(lng1, lng2)])
    .then((problems) => {
      const result = [];

      for (const problem of problems) {
        result.push(getVerifications(problem));
      }
      return Promise.all(result);
    })
    .then((problems) => {
      res.send(problems);
    })
    .catch((err) => {
      next(err);
    })
})

/*
  ------------------------------------------------------------------------------
  Create new problem
  ------------------------------------------------------------------------------
*/

router.post('/problem', (req, res, next) => {
  const { user_id, title, description, lat, lng, category_id } = req.body;

  knex('problems').insert([
    { user_id, title, description, lat, lng, category_id }
  ])
  .returning('*')
  .then((problem) => {
    res.send(problem[0]);
  })
  .catch((err) => {
    next(err);
  });
});

/*
  ------------------------------------------------------------------------------
  Create or change verification
  ------------------------------------------------------------------------------
*/

router.get('/verification/:userId/:probId', (req, res, next) => {
  const { userId, probId } = req.params;

  knex('verifications')
    .where('user_id', userId)
    .where('prob_id', probId)
    .returning('*')
    .then((verification) => {
      if (verification[0]) {
        const verified = verification[0];
        res.send(verified);
      }
      else {
        res.send(false);
      }
    })
    .catch((err) => {
      next(err);
    });
});

router.post('/verification', (req, res, next) => {
  const { userId, probId, verification } = req.body;

  knex('verifications').insert([
    {
      prob_id: probId,
      user_id: userId,
      verified: verification
    }
  ])
  .returning('*')
  .then((newVerification) => {
    const newVerified = newVerification[0];

    res.send(newVerified);
  })
  .catch((err) => {
    next(err);
  })
});

router.patch('/verification', (req, res, next) => {
  const { userId, probId, verification } = req.body;

  knex('verifications')
    .where('user_id', userId)
    .where('prob_id', probId)
    .update('verified', verification)
    .returning('*')
    .then((verification) => {
      const newVerified = verification[0];

      res.send(newVerified);
    })
    .catch((err) => {
      next(err);
    });
});


module.exports = router;
