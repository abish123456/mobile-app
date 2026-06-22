import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';
import { MapPin } from 'lucide-react';

export default function LocationValidationDialog({ open, onOpenChange, onConfirm }) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="w-[95vw] max-w-[400px] rounded-2xl border-none">
                <AlertDialogHeader>
                    <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                        <MapPin className="h-6 w-6 text-destructive" />
                    </div>
                    <AlertDialogTitle className="text-xl font-black text-center">Service Area Not Available</AlertDialogTitle>
                    <AlertDialogDescription className="font-medium text-muted-foreground text-center">
                        The selected location is outside our service area. Please choose a proper service area location.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-4">
                    <AlertDialogAction
                        onClick={onConfirm}
                        className="w-full rounded-xl h-12 font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        Choose Proper Service Area
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
