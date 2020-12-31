//$("document").ready(function() {
//});
$(window).focus(function(){localStorage.getItem('debug') ? setTimeout('window.location.reload()',200) : 1;});

var date = new Date();
date = date.getFullYear();
$('footer').html('Simulation Laboratory © ' + slpr() + ', ' + date);
function slpr() {
    var v1,v2,v3,v4,v5,v6,v7,v8,v9;
    v1='<a href="';
    v2='m@g';
    v3='>Yurii M. Ovcharenko</a>';
    v4='ia';
    v5='p.oy';
    v6='mai';
    v7='l';
    v8='to:';
    v9='.com"';
    return v1+v6+v7+v8+v4+v5+v2+v6+v7+v9+v3;
}

