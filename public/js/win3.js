jQuery(document).ready(function ($) {
	$(".window-border").draggable({
		handle: ".title",
	});

	$(".dialog-border").draggable({
		handle: ".title",
	});


	$(".max").click(function () {
		if ($(this).text() === "&#11109;") $(this).html("&#9650;");
		else $(this).html("&#11109;");

		$(this).closest(".window").toggleClass("maximize");

	});


	$(".close").click(function () {
		$(this).closest(".window").hide();
	});

	$(".min").click(function () {

		var wind = $(this).closest(".window");

		wind.hide();
		//show an icon at the bottom with the window title
		//when clicked, it will restore the window
		var title = wind.find(".title").text();
		var icon = wind.find(".icon").text();
		
		var taskbar = $(".taskbar");
		var task = $("<div class='task'></div>");
		task.html(icon + title);
		taskbar.append(task);
		
		
	}

		
	);


	$(".window-border").resizable({
		// helper: "ui-resizable-helper",
		handles: {
			nw: ".topleft",
			ne: ".topright",
			sw: ".bottomleft",
			se: ".bottomright",
		},
	});


	
	$(".dialog-border").resizable({
		// helper: "ui-resizable-helper",
		handles: {
			nw: ".topleft",
			ne: ".topright",
			sw: ".bottomleft",
			se: ".bottomright",
		},
	});


	$(".contextbutton").click(function () {
		var contextMenu = $(this).parent().parent().find(".context-menu");

		contextMenu.insertAfter($(this));

		contextMenu.css({
			left: $(this).position().left + "px",
			top: $(this).position().top + $(this).height() + 4 + "px",
			position: "absolute",
		}).show();


	});

	$(document).bind("click", function (e) {
		if (!$(e.target).hasClass("contextbutton") && !$(e.target).is(".context-menu")) {
			$(".context-menu").hide();
		}
	});


	

});
