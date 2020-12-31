//$(document).ready(function() {
//});
$(function(){
    var includes = $('[data-include]');
    jQuery.each(includes, function(){
        var file = 'temlates/' + $(this).data('include') + '.html';
        $(this).load(file, function(){
            if (include = 'main_menu') {
                var re = new RegExp(".*\/(.*?)$", "g");
                $('[href="/'+re.exec(location)[1]+'"]').parent().addClass('active');
            }
        });
    });
});
