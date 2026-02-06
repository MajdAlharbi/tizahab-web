from django.shortcuts import render

# Create your views here.
from django.shortcuts import render

# Events list page
def events_list(request):
    return render(request, "events_list.html")


# Event details page
def event_details(request, event_id):
    return render(request, "event_details.html", {
        "event_id": event_id
    })
