
var config = require('config');
var gulp = require('gulp');
var path = require('path');
var findup = require('findup').sync;
var gulpLoadPlugins = require('gulp-load-plugins');

//----------------------------------------------------------
// Main opine function.
// This is designed to be called from within a gulpfile.
// It will add all discovered opine tasks and populate a 'watch'
// task.
function opine() {
    execute_opine();
}

// inject hoisted function as dependency
var Module = require('./module')(opine);

var tasks = {};
var task_watches = [];
var task_altwatch = [];
var task_builds = [];

function execute_opine() {
    // import all modules named "opine-*"
    var parentDir = path.dirname(module.parent.filename);
    var options = {
        DEBUG: false,
        pattern: ['gulp-opine-*', 'opine-*', '!gulp-opine'],
        lazy: false,
        config: findup(parentDir, 'package.json') + '/package.json'
    };
    var modules = gulpLoadPlugins(options);

    if(requiredConfig) {
        console.log('Required config missing:');
        console.log(JSON.stringify(requiredConfig, null, 4));
        throw new Error('The missing configuration values must be defined.');
    }

    // create default gulptask
    opine.module('build').depends(task_builds);
    opine.module('default').depends('build');
    opine.module('deploy').depends('build');

    // knit together all post-dependencies
    var keys = Object.keys(tasks);
    keys.forEach(function(k) {
        var module = tasks[k];
        module.postreqs.forEach(function(post) {
            var prereqModule = tasks[post];
            if(prereqModule) {
                prereqModule.depends(module.name);
            }
        });
    });

    // create all tasks
    var noop = function() {};
    keys.forEach(function(k) {
        var module = tasks[k];
        gulp.task(module.name, module.prereqs, module.execute || noop);
    });

    // create watches on all files that need them
    gulp.task('watch', function(done) {
        for(var i = 0; i < task_altwatch.length; ++i) {
            gulp.start(task_altwatch[i]);
        }
        for(var i = 0; i < task_watches.length; ++i) {
            var w = task_watches[i];
            console.log('Watching', w.path, 'for', w.task);
            if(typeof(w.task) === 'string') {
                gulp.watch(w.path, [w.task]);
            } else {
                gulp.watch(w.path, w.task);
            }
        }
        // don't call done() -- a watch is never done! it's watching!
    });

    // create develop task, to build everything and then watch
    gulp.task('develop', ['build'], function() {
        gulp.start('watch');
    });

    // task to print out all config variables that are using defaults
    gulp.task('config-defaults', function() {
        console.log(JSON.stringify(missingConfig, null, 4));
    });
}

//----------------------------------------------------------
//----------------------------------------------------------
// Below are exported extra functions and objects.
// These are designed to be used by opine-* modules rather than
// being called by end users directly
//----------------------------------------------------------
//----------------------------------------------------------

// utility function to recursively get a value from an object
// via dot-separated string ID (eg 'opine.module.value') with
// the ability to use a default value if the key is not configured
function index(obj,is, value) {
    if (typeof is == 'string') {
        return index(obj,is.split('.'), value);
    } else if (is.length==1 && value!==undefined) {
        return obj[is[0]] = value;
    } else if (is.length==0) {
        return obj;
    } else {
        var subobj = obj[is[0]];
        if(!subobj) {
            subobj = {};
            obj[is[0]] = subobj;
        }
        return index(obj[is[0]],is.slice(1), value);
    }
}

// state variables to track which keys are using default values
var missingConfig = {};
var requiredConfig = null;

// function to get global configs
opine.getConfig = function(id, fallback) {
    var tid = 'opine.' + id;
    if(config.has(tid)) {
        // key is configured: use it
        return config.get(tid);
    } else if(typeof(fallback) === 'undefined') {
        // key is not configured and no default given: error
        index(missingConfig, id, 'REQUIRED');
        if(!requiredConfig) {
            requiredConfig = {};
        }
        index(requiredConfig, id, 'REQUIRED');
        return 'REQUIRED';
    } else {
        // key is not configured but we have a default: use that
        index(missingConfig, id, fallback);
        return fallback;
    }
};

var base_source = opine.getConfig('base.source', 'frontend');
var base_dest = opine.getConfig('base.dest', 'public');

// function to get non-module-specific sources
opine.getSources = function(id, extensions) {
    var dir = opine.getConfig(id + '.source', base_source + '/' + id);
    extensions = opine.getConfig(id + '.extensions', extensions || '');
    if(typeof(extensions) == 'string') {
        extensions = [extensions];
    }
    return (extensions || []).map(function(e) {
        if(e[0] === '!') {
            return '!' + dir + '/**/*' + e.slice(1);
        } else {
            return dir + '/**/*' + e; 
        }
    });
}

// function to get non-module-specific targets
opine.getDest = function(id) {
    return opine.getConfig(id + '.dest', base_dest + '/' + id);
}

// opine-* modules should use this to indicate that the
// task they define should be executed as part of build
opine.addBuild = function(task) {
    task_builds.push(task);
};

// opine-* modules should use this to add a watch task that
// needs to run outside of the gulp.watch system (for eg watchify)
opine.addAltWatch = function(task) {
    task_altwatch.push(task);
};

// opine-* modules should use this to indicate that the
// task that they define has a watch component
opine.addWatch = function(path, task) {
    task_watches.push({
        path: path,
        task: task
    });
};

// function to generate an object with modularised versions of 
// the above functions. It's kind of a weak implementation of currying.
opine.module = function(name) {
    if(tasks[name] !== undefined) {
        return tasks[name];
    } else {
        var m = new Module(name);
        tasks[name] = m;
        return m;
    }
};

module.exports = opine;

